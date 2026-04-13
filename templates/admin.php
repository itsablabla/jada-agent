<?php
/** @var array $_ */
script('jadaagent', 'jadaagent-admin');
?>
<div id="jada-agent-admin">
    <div class="section">
        <h2><?php p($l->t('Jada Agent — LibreChat Settings')); ?></h2>
        <p class="settings-hint"><?php p($l->t('Configure the connection to your LibreChat backend.')); ?></p>
        
        <div class="jada-settings-form">
            <label for="openclaw-url"><?php p($l->t('OpenClaw URL')); ?></label>
            <input type="text" id="openclaw-url" 
                   value="<?php p($_['openclaw_url']); ?>" 
                   placeholder="http://LibreChat:3080" />
            
            <label for="openclaw-token"><?php p($l->t('API Token')); ?></label>
            <input type="password" id="openclaw-token" 
                   value="<?php p($_['openclaw_token']); ?>" 
                   placeholder="jada-agent-oc-key-2026" />
            
            <button id="save-openclaw-settings" class="primary">
                <?php p($l->t('Save')); ?>
            </button>
            <span id="openclaw-settings-msg"></span>
        </div>
    </div>
</div>
