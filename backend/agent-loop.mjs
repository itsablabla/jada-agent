import OpenAI from "openai";

const MAX_TOOL_ROUNDS = 100; // no practical cap — let the agent run as many rounds as needed
const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

/**
 * Agent loop: sends messages to the model, handles tool calls,
 * executes them via MCP, feeds results back, repeats until
 * the model produces a final text response.
 */
export async function agentLoop({
  conversation,
  tools,
  model,
  apiKey,
  mcpHub,
  onToken,
  onReasoning,
  onToolCall,
  onToolResult,
}) {
  const client = new OpenAI({
    baseURL: OPENROUTER_BASE,
    apiKey,
  });

  let messages = [...conversation];
  let round = 0;

  while (round < MAX_TOOL_ROUNDS) {
    round++;

    // Decide whether to include tools
    const requestParams = {
      model,
      messages,
      stream: true,
    };

    // Only include tools if we have any
    if (tools.length > 0) {
      // Prioritize tools by server importance:
      // 1. Nextcloud (primary mission — full Nextcloud control)
      // 2. Composio (app integrations — meta-tools)
      // 3. proton-unified (mail, drive, iCloud, beeper, fabric)
      const TOOL_CAP = 200;
      const priority = ["nextcloud", "composio", "proton-unified"];
      const prioritized = [];
      const rest = [];
      for (const t of tools) {
        const server = t.function.name.split("__")[0];
        if (priority.includes(server)) {
          prioritized.push(t);
        } else {
          rest.push(t);
        }
      }
      const toolSubset = [...prioritized, ...rest].slice(0, TOOL_CAP);
      requestParams.tools = toolSubset;
      requestParams.tool_choice = "auto";
    }

    const stream = await client.chat.completions.create(requestParams);

    // Accumulate the response
    let assistantContent = "";
    let toolCalls = []; // {id, name, arguments}
    let currentToolCall = null;

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta;
      if (!delta) continue;

      // Reasoning/chain-of-thought content (OpenRouter extended fields)
      if (delta.reasoning && onReasoning) {
        onReasoning(delta.reasoning);
      }

      // Text content
      if (delta.content) {
        assistantContent += delta.content;
        onToken(delta.content);
      }

      // Tool calls
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          if (tc.index !== undefined) {
            // New or continuing tool call
            if (!toolCalls[tc.index]) {
              toolCalls[tc.index] = { id: tc.id || "", name: "", arguments: "" };
            }
            if (tc.id) toolCalls[tc.index].id = tc.id;
            if (tc.function?.name) toolCalls[tc.index].name += tc.function.name;
            if (tc.function?.arguments) toolCalls[tc.index].arguments += tc.function.arguments;
          }
        }
      }

      // Finish reason
      if (chunk.choices?.[0]?.finish_reason === "stop") {
        // Model finished with text — we're done
        return;
      }
    }

    // Filter out empty tool calls
    toolCalls = toolCalls.filter((tc) => tc && tc.name);

    if (toolCalls.length === 0) {
      // No tool calls and stream ended — done
      return;
    }

    // ── Execute tool calls ──────────────────────────────────────
    // Add assistant message with tool calls to conversation
    messages.push({
      role: "assistant",
      content: assistantContent || null,
      tool_calls: toolCalls.map((tc) => ({
        id: tc.id,
        type: "function",
        function: { name: tc.name, arguments: tc.arguments },
      })),
    });

    // Execute each tool call in parallel
    const toolResults = await Promise.all(
      toolCalls.map(async (tc) => {
        let args = {};
        try {
          args = JSON.parse(tc.arguments || "{}");
        } catch {
          args = {};
        }

        onToolCall(tc.name, args);

        const result = await mcpHub.callTool(tc.name, args);

        // Extract text content from MCP result
        let textContent = "";
        if (result.content) {
          if (typeof result.content === "string") {
            textContent = result.content;
          } else if (Array.isArray(result.content)) {
            textContent = result.content
              .map((c) => (c.type === "text" ? c.text : JSON.stringify(c)))
              .join("\n");
          } else {
            textContent = JSON.stringify(result.content);
          }
        }

        onToolResult(tc.name, { content: textContent, isError: result.isError });

        return {
          role: "tool",
          tool_call_id: tc.id,
          content: textContent || "Tool returned no output",
        };
      })
    );

    // Add tool results to conversation
    messages.push(...toolResults);

    // Continue the loop — model will process tool results and either
    // call more tools or produce a final response
  }

  // If we hit max rounds, let the user know
  onToken("\n\n[Reached maximum tool execution rounds. Please try a simpler request.]");
}
