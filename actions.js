module.exports = function (self) {
    self.setActionDefinitions({
        force_sync: {
            name: 'Force Sync Event',
            description: 'Manually triggers the Sync Event immediately.',
            options: [],
            callback: async () => {
                self.log('info', 'Force Sync Event triggered by user.');
                await self.syncEvent();
                self.checkFeedbacks('last_sync_status');
            }
        },
        toggle_auto_sync: {
            name: 'Toggle Auto Sync Status',
            description: 'Switches auto-sync between enabled and disabled.',
            options: [],
            callback: async () => {
                const currentStatus = self.getVariableValue('auto-sync') || 'enabled';
                const newStatus = currentStatus === 'enabled' ? 'disabled' : 'enabled';
                self.setVariableValues({ 'auto-sync': newStatus });
                self.log('info', `Auto Sync Status changed to: ${newStatus}`);
                self.checkFeedbacks('auto_sync_status');
            }
        },
        toggle_time_mode: {
            name: 'Toggle Time Mode',
            description: 'Switches time mode between enabled and disabled.',
            options: [],
            callback: async () => {
                const currentStatus = self.getVariableValue('time-mode') || 'enabled';
                const newStatus = currentStatus === 'enabled' ? 'disabled' : 'enabled';
                self.setVariableValues({ 'time-mode': newStatus });
                self.log('info', `Time Mode changed to: ${newStatus}`);
                self.checkFeedbacks('time_mode_status');

                if (newStatus === 'disabled') {
                    self.log('info', 'Time Mode disabled - Determining current presentation position.');
                    await self.updatePresentationPosition();
                    self.log('info', 'Setting manual presentation based on position.');
                    await self.setManualPresentationPosition();
                }
            }
        },
        switch_to_previous: {
            name: 'Switch to Previous Presentation',
            description: 'Moves to the previous presentation in manual mode',
            options: [],
            callback: async () => {
                const timeModeStatus = self.getVariableValue('time-mode') || 'enabled';
                if (timeModeStatus === 'enabled') {
                    self.log('info', 'Disabling time mode for manual presentation control.');
                    self.setVariableValues({ 'time-mode': 'disabled' });
                    self.checkFeedbacks('time_mode_status');
                    await self.updatePresentationPosition();
                }

                const currentPosition = parseInt(self.getVariableValue('time-mode-disabled-presentation-position')) || 1;
                const newPosition = Math.max(1, currentPosition - 1);
                self.setVariableValues({ 
                    'time-mode-disabled-presentation-position': newPosition.toString() 
                });
                
                self.log('info', `Manual position changed to: ${newPosition}`);
                await self.setManualPresentationPosition();
            }
        },
        switch_to_next: {
            name: 'Switch to Next Presentation',
            description: 'Moves to the next presentation in manual mode',
            options: [],
            callback: async () => {
                const timeModeStatus = self.getVariableValue('time-mode') || 'enabled';
                if (timeModeStatus === 'enabled') {
                    self.log('info', 'Disabling time mode for manual presentation control.');
                    self.setVariableValues({ 'time-mode': 'disabled' });
                    self.checkFeedbacks('time_mode_status');
                    await self.updatePresentationPosition();
                }

                // ... rest of the switch_to_next code ...
            }
        },
        begin_current_presentation: {
            name: 'Begin Current Presentation',
            description: 'Sets actual start time and adjusts duration based on real-time start.',
            options: [],
            callback: async () => {
                // ... existing begin_current_presentation code ...
            }
        }
    });
};