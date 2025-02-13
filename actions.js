module.exports = function (self) {
    self.setActionDefinitions({
        force_sync: {
            name: 'Force Sync Event',
            description: 'Manually triggers the Sync Event immediately.',
            options: [],
            callback: async () => {
                self.log('info', 'Force Sync Event triggered by user.');
                await self.syncEvent();
            },
        },
        toggle_auto_sync: {
            name: 'Toggle Auto Sync Status',
            description: 'Switches auto-sync between enabled and disabled.',
            options: [],
            callback: async () => {
                // Get current status
                const currentStatus = self.getVariableValue('auto-sync') || 'enabled';

                // Toggle value
                const newStatus = currentStatus === 'enabled' ? 'disabled' : 'enabled';

                // Update variable
                self.setVariableValues({ 'auto-sync': newStatus });

                // Log change
                self.log('info', `Auto Sync Status changed to: ${newStatus}`);
            },
        },
        toggle_time_mode: {
            name: 'Toggle Time Mode',
            description: 'Switches time mode between enabled and disabled.',
            options: [],
            callback: async () => {
                // Get current time-mode status
                const currentStatus = self.getVariableValue('time-mode') || 'enabled';

                // Toggle value
                const newStatus = currentStatus === 'enabled' ? 'disabled' : 'enabled';

                // Update variable
                self.setVariableValues({ 'time-mode': newStatus });

                // Log change
                self.log('info', `Time Mode changed to: ${newStatus}`);

                // If time mode is now disabled, calculate position and set manual presentation
                if (newStatus === 'disabled') {
                    self.log('info', 'Time Mode disabled - Determining current presentation position.');
                    await self.updatePresentationPosition();
                    self.log('info', 'Setting manual presentation based on position.');
                    await self.setManualPresentationPosition();
                }
            },
        },
        switch_to_previous: {
            name: 'Switch to Previous Presentation',
            description: 'Moves to the previous presentation in manual mode',
            options: [],
            callback: async () => {
                // Check and disable time-mode if enabled
                const timeModeStatus = self.getVariableValue('time-mode') || 'enabled';
                if (timeModeStatus === 'enabled') {
                    self.log('info', 'Disabling time mode for manual presentation control.');
                    self.setVariableValues({ 'time-mode': 'disabled' });
                    await self.updatePresentationPosition();
                }

                // Get current position
                const currentPosition = parseInt(self.getVariableValue('time-mode-disabled-presentation-position')) || 1;
                
                // Calculate new position (minimum of 1)
                const newPosition = Math.max(1, currentPosition - 1);
                
                // Update position variable
                self.setVariableValues({ 
                    'time-mode-disabled-presentation-position': newPosition.toString() 
                });
                
                self.log('info', `Manual position changed to: ${newPosition}`);
                
                // Update presentations based on new position
                await self.setManualPresentationPosition();
            },
        },
        switch_to_next: {
            name: 'Switch to Next Presentation',
            description: 'Moves to the next presentation in manual mode',
            options: [],
            callback: async () => {
                // Check and disable time-mode if enabled
                const timeModeStatus = self.getVariableValue('time-mode') || 'enabled';
                if (timeModeStatus === 'enabled') {
                    self.log('info', 'Disabling time mode for manual presentation control.');
                    self.setVariableValues({ 'time-mode': 'disabled' });
                    await self.updatePresentationPosition();
                }

                let presentationCount;

                // Try to get presentations from API first
                try {
                    const presentationManagementBoardId = self.getVariableValue('synced-presentation-management-board');
                    const myRoomId = self.getVariableValue('my-room') || 'Unknown';
                    const presentations = await self.getTodaysPresentations(presentationManagementBoardId, myRoomId);
                    presentationCount = presentations.length;
                } catch (error) {
                    // If API fails, try to get count from cached data
                    self.log('info', `Failed to get presentations from API, checking cache: ${error.message}`);
                    try {
                        let baseDir;
                        if (process.platform === 'win32') {
                            baseDir = path.join(process.env.APPDATA || 'C:\\ProgramData', 'BitCompanionSync');
                        } else {
                            baseDir = path.join('/var/lib', 'BitCompanionSync');
                        }
                        const filePath = path.join(baseDir, 'presentation_sync_data.json');
                        
                        const fileContent = fs.readFileSync(filePath, 'utf-8');
                        const cachedData = JSON.parse(fileContent);
                        
                        // Filter for today's presentations
                        const todayDate = new Date().toISOString().split('T')[0];
                        const todaysPresentations = cachedData.presentations.filter(p => p.sessionDate === todayDate);
                        presentationCount = todaysPresentations.length;
                    } catch (error) {
                        self.log('error', `Failed to get presentation count from cache: ${error.message}`);
                        return;
                    }
                }

                // Get current position
                const currentPosition = parseInt(self.getVariableValue('time-mode-disabled-presentation-position')) || 1;
                
                // Calculate new position (maximum of presentationCount)
                const newPosition = Math.min(presentationCount, currentPosition + 1);
                
                // Update position variable
                self.setVariableValues({ 
                    'time-mode-disabled-presentation-position': newPosition.toString() 
                });
                
                self.log('info', `Manual position changed to: ${newPosition} of ${presentationCount}`);
                
                // Update presentations based on new position
                await self.setManualPresentationPosition();
            },
        },
    });
};