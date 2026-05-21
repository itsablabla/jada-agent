<?php
/** @var array $_ */
script('jadaagent', 'jadaagent-admin');
?>
<div id="jada-agent-admin">
    <div class="section">
        <h2><?php p($l->t('Jada Agent — LibreChat Settings')); ?></h2>
        <p class="settings-hint"><?php p($l->t('Configure the connection to your LibreChat backend.')); ?></p>
        
        <div class="jada-settings-form">
            <label for="openclaw-url"><?php p($l->t('LibreChat URL')); ?></label>
            <input type="text" id="openclaw-url" 
                   value="<?php p($_['openclaw_url']); ?>" 
                   placeholder="http://LibreChat:3080" />
            
            <label for="openclaw-token"><?php p($l->t('API Token (Agents API)')); ?></label>
            <input type="password" id="openclaw-token" 
                   value="<?php p($_['openclaw_token']); ?>" 
                   placeholder="sk-..." />

            <h3><?php p($l->t('Service Account (JWT Auth)')); ?></h3>
            <p class="settings-hint"><?php p($l->t('Used for server-side conversations, search, tags, and other internal APIs.')); ?></p>

            <label for="librechat-service-email"><?php p($l->t('Service Email')); ?></label>
            <input type="text" id="librechat-service-email" 
                   value="<?php p($_['librechat_service_email']); ?>" 
                   placeholder="jada@nextcloud.local" />

            <label for="librechat-service-password"><?php p($l->t('Service Password')); ?></label>
            <input type="password" id="librechat-service-password" 
                   value="<?php p($_['librechat_service_password']); ?>" 
                   placeholder="Enter service account password" />
            
            <button id="save-openclaw-settings" class="primary">
                <?php p($l->t('Save')); ?>
            </button>
            <span id="openclaw-settings-msg"></span>
        </div>
    </div>
</div>
