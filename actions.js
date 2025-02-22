const path = require('path'); // Add this line to import path
const fs = require('fs');     // Add this too, since you're using fs (assuming it was missing here)

module.exports = function (self) {
    self.setActionDefinitions({
        force_sync: {
            name: 'Force Sync Event',
            description: 'Manually triggers the Sync Event immediately.',
            options: [],
            callback: async () => {
                self.log('info', 'Force Sync Event triggered by user.');
                
                // Set a flag to indicate force sync
                self.forceSyncInProgress = true;
                
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
                self.checkFeedbacks('auto_sync_status');  // Add this line to check feedback
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
                self.checkFeedbacks('time_mode_status');  // Add this line to check feedback

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
                    self.checkFeedbacks('time_mode_status');  // Add this line to check feedback
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
                    self.checkFeedbacks('time_mode_status');  // Add this line to check feedback
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

                const currentPosition = parseInt(self.getVariableValue('time-mode-disabled-presentation-position')) || 1;
                const newPosition = Math.min(presentationCount, currentPosition + 1);
                
                self.setVariableValues({ 
                    'time-mode-disabled-presentation-position': newPosition.toString() 
                });
                
                self.log('info', `Manual position changed to: ${newPosition} of ${presentationCount}`);
                await self.setManualPresentationPosition();
            }
        },
        begin_current_presentation: {
            name: 'Begin Current Presentation',
            description: 'Sets actual start time and adjusts duration based on real-time start.',
            options: [],
            callback: async () => {
                const timeMode = self.getVariableValue('time-mode') || 'enabled';
                if (timeMode === 'disabled') {
                    self.log('info', 'Time Mode is disabled. Cannot begin presentation.');
                    return;
                }
                const now = new Date();
                const actualStartTime = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
                const currentPresentation = {
                    startTime: self.getVariableValue('presentation-timeslot-c')?.split(' - ')[0],
                    endTime: self.getVariableValue('presentation-timeslot-c')?.split(' - ')[1],
                };
                if (!currentPresentation.endTime) {
                    self.log('error', 'No valid current presentation found. Cannot begin.');
                    return;
                }
                const endTime = self.parseTime(currentPresentation.endTime);
                const actualStart = self.parseTime(actualStartTime);
                if (!endTime || !actualStart) {
                    self.log('error', 'Error parsing presentation times. Cannot begin.');
                    return;
                }
                const durationMinutes = Math.max(0, (endTime - actualStart) / (1000 * 60));
                self.setVariableValues({
                    'current-presentation-actual-start-time': actualStartTime,
                    'current-presentation-actual-duration': durationMinutes.toString() + ' minutes'
                });
                self.log('info', `✅ Current presentation started at ${actualStartTime}, duration set to ${durationMinutes} minutes.`);
            }
        },
        add_letter_to_password: {
            name: 'Add Letter to Presentation Password Input',
            description: 'Appends a letter to the current presentation password input.',
            options: [
                {
                    type: 'textinput',
                    id: 'letter',
                    label: 'Letter to Add',
                    default: '',
                    regex: '/^[a-zA-Z]$/'
                }
            ],
            callback: async (action) => {
                const letter = action.options.letter;
        
                if (!letter || letter.length !== 1) {
                    self.log('error', 'Invalid input: Please provide a single letter.');
                    return;
                }
        
                const currentPassword = self.getVariableValue('presentation-password-input') || '';
        
                if (currentPassword.length >= 5) {
                    self.log('info', 'Password input already at max length (5 characters).');
                    return;
                }
        
                const newPassword = currentPassword + letter;
                self.setVariableValues({ 'presentation-password-input': newPassword });
        
                self.log('info', `Updated password input: ${newPassword}`);
            }
        },
        remove_last_letter_from_password: {
            name: 'Remove Last Letter from Presentation Password Input',
            description: 'Removes the last letter from the current presentation password input.',
            options: [],
            callback: async () => {
                const currentPassword = self.getVariableValue('presentation-password-input') || '';
        
                if (currentPassword.length === 0) {
                    self.log('info', 'Password input is already empty. Nothing to remove.');
                    return;
                }
        
                const newPassword = currentPassword.slice(0, -1);
                self.setVariableValues({ 'presentation-password-input': newPassword });
        
                self.log('info', `Updated password input after backspace: ${newPassword}`);
            }
        },
        reset_sync: {
            name: 'Reset Sync Data',
            description: 'Clears all synced variables and forces a fresh start from project overview detection.',
            options: [],
            callback: async () => {
                self.log('info', '🔄 Resetting sync data and restarting from project overview detection...');
        
                // Reset key sync-related variables
                self.setVariableValues({
                    'last-board-sync': 'Never',
                    'board-sync-status': 'Unsynced',
                    'synced-room-info-board': 'Unknown',
                    'synced-presentation-management-board': 'Unknown',
                    'synced-project-overview-item-id': 'Unknown',
                    'my-room': 'Unknown'
                });
        
                // Stop any ongoing sync process
                if (self.syncingProcessInterval) {
                    clearInterval(self.syncingProcessInterval);
                    self.syncingProcessInterval = null;
                }
        
                // Clear local cache
                try {
                    let baseDir;
                    if (process.platform === 'win32') {
                        baseDir = path.join(process.env.APPDATA || 'C:\\ProgramData', 'BitCompanionSync');
                    } else {
                        baseDir = path.join('/var/lib', 'BitCompanionSync');
                    }
                    const filePath = path.join(baseDir, 'presentation_sync_data.json');
        
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                        self.log('info', `🗑 Deleted cached sync file: ${filePath}`);
                    } else {
                        self.log('info', 'No cached sync file found to delete.');
                    }
                } catch (error) {
                    self.log('error', `❌ Error clearing cached sync file: ${error.message}`);
                }
        
                // Reset the last synced project ID
                self.lastSyncedProjectId = null;
        
                // Restart the project overview detection process
                self.log('info', '🔍 Restarting search for synced project overview...');
                self.repeatingBoardQuery = setInterval(() => self.findSyncedProjectOverview(), 10000);
            }
        },
        lookup_presentation_by_password: {
            name: 'Lookup Presentation by Password',
            description: 'Finds a presentation based on the password input and retrieves its file path.',
            options: [],
            callback: async () => {
                try {
                    // Get the password input
                    const enteredPassword = self.getVariableValue('presentation-password-input') || '';
                    self.log('debug', `Entered password: "${enteredPassword}"`);
                    
                    if (!enteredPassword) {
                        self.log('warn', 'No password entered. Cannot perform lookup.');
                        return;
                    }
        
                    // Determine the file path based on OS
                    let baseDir;
                    if (process.platform === 'win32') {
                        baseDir = path.join(process.env.APPDATA || 'C:\\ProgramData', 'BitCompanionSync');
                    } else {
                        baseDir = path.join('/var/lib', 'BitCompanionSync');
                    }
        
                    const filePath = path.join(baseDir, 'presentation_sync_data.json');
                    self.log('debug', `Reading sync data from: ${filePath}`);
        
                    // Check if the sync file exists
                    if (!fs.existsSync(filePath)) {
                        self.log('error', 'Sync data file not found. Cannot perform lookup.');
                        return;
                    }
        
                    // Read and parse the JSON file
                    const fileContent = fs.readFileSync(filePath, 'utf-8');
                    self.log('debug', `Sync data content: ${fileContent}`);
                    const syncData = JSON.parse(fileContent);
                    
                    if (!syncData.presentations || syncData.presentations.length === 0) {
                        self.log('warn', 'No presentations found in sync data.');
                        return;
                    }
        
                    // Log all presenter passwords for debugging
                    self.log('debug', `Presentation passwords: ${JSON.stringify(syncData.presentations.map(p => p.presenterPassword))}`);
        
                    // Look for a presentation with the matching password
                    const matchingPresentation = syncData.presentations.find(p => p.presenterPassword === enteredPassword);
        
                    if (matchingPresentation) {
                        const matchedFilePath = matchingPresentation.filePath;
                        self.log('info', `✅ Matching presentation found! File Path: ${matchedFilePath}`);
                        self.setVariableValues({ 'matched-presentation-file-path': matchedFilePath });
                    } else {
                        self.log('warn', `No presentation found with the entered password: ${enteredPassword}`);
                    }
                } catch (error) {
                    self.log('error', `❌ Error in lookup_presentation_by_password: ${error.message}`);
                }
            }
        }
    });
};