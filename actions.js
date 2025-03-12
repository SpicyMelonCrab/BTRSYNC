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
                self.checkFeedbacks('sync_status');
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
                self.checkFeedbacks('time_mode_status');
        
                if (newStatus === 'disabled') {
                    self.log('info', 'Time Mode disabled - Determining current presentation position.');
                    await self.updatePresentationPosition();
                    self.log('info', 'Setting manual presentation based on position.');
                    await self.setManualPresentationPosition();
                } else {
                    // If time mode is being enabled, trigger an immediate sync event
                    self.log('info', 'Time Mode enabled - triggering immediate sync event');
                    await self.syncEvent();
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
        
                if (currentPassword.length >= 4) {
                    self.log('info', 'Password input already at max length (4 characters).');
                    return;
                }
        
                const newPassword = currentPassword + letter;
                self.setVariableValues({ 'presentation-password-input': newPassword });
                self.log('info', `Updated password input: ${newPassword}`);
                
                // Auto-lookup if password is now 4 characters
                if (newPassword.length === 4) {
                    self.log('info', `Password reached 4 characters. Automatically looking up matching presentation...`);
                    
                    try {
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
                        const syncData = JSON.parse(fileContent);
                        
                        if (!syncData.presentations || syncData.presentations.length === 0) {
                            self.log('warn', 'No presentations found in sync data.');
                            return;
                        }
        
                        // Look for a presentation with the matching password
                        const matchingPresentation = syncData.presentations.find(p => p.presenterPassword === newPassword);
        
                        if (matchingPresentation) {
                            const matchedFilePath = matchingPresentation.filePath;
                            self.log('info', `✅ Matching presentation found! File Path: ${matchedFilePath}`);
                            self.setVariableValues({ 'current-sr-file-path': matchedFilePath });
                        } else {
                            self.log('warn', `No presentation found with the entered password: ${newPassword}`);
                        }
                    } catch (error) {
                        self.log('error', `❌ Error in auto-lookup: ${error.message}`);
                    }
                }
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
                
                // Reset the current-sr-file-path variable to "Unknown" when a letter is removed
                self.setVariableValues({ 
                    'presentation-password-input': newPassword,
                    'current-sr-file-path': 'Not Set'
                });
        
                self.log('info', `Updated password input after backspace: ${newPassword}`);
                self.log('info', 'Reset current-sr-file-path to "Not Set"');
            }
        },
       reset_sync: {
    name: 'Reset Sync Data',
    description: 'Clears all synced variables and forces a fresh start from project overview detection.',
    options: [],
    callback: async () => {
        self.log('info', '🔄 Checking Monday.com connection before resetting sync data...');

        // Check Monday.com connection first
        try {
            const mondayApiToken = self.config['monday-api-token'];
            if (!mondayApiToken) {
                self.log('error', '❌ Monday API Token is not set. Cannot reset sync.');
                return;
            }

            // Simple query to test connection
            const response = await fetch('https://api.monday.com/v2', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': mondayApiToken
                },
                body: JSON.stringify({
                    query: `
                        query {
                            me {
                                id
                                name
                            }
                        }
                    `
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }

            const result = await response.json();

            if (result.errors) {
                throw new Error(`API error: ${result.errors[0].message}`);
            }

            self.log('info', `✅ Connection to Monday.com successful. Proceeding with reset.`);
        } catch (error) {
            self.log('error', `❌ Failed to connect to Monday.com: ${error.message}`);
            self.log('error', 'Reset sync aborted. Please check your connection and API token.');
            return;
        }

        // If we reach here, connection is good, proceed with reset
        self.log('info', '🔄 Resetting sync data and restarting from project overview detection...');

        // Reset key sync-related variables
        self.setVariableValues({
            'last-board-sync': 'Never',
            'board-sync-status': 'Unsynced',
            'synced-room-info-board': 'Unknown',
            'synced-help-requests-board': 'Unknown',
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
                        self.setVariableValues({ 'current-sr-file-path': matchedFilePath });
                    } else {
                        self.log('warn', `No presentation found with the entered password: ${enteredPassword}`);
                    }
                } catch (error) {
                    self.log('error', `❌ Error in lookup_presentation_by_password: ${error.message}`);
                }
            }
        },
        request_help: {
            name: 'Request Help',
            description: 'Requests help by querying the group ID, finding a matching subitem, and sending assigned crew details plus synced variables to a webhook.',
            options: [],
            callback: async () => {
                // Prepare a payload object that we'll build up throughout the function
                let payload = {
                    roomId: 'Unknown',
                    roomName: 'Unknown',
                    groupId: 'Unknown',
                    subitemId: 'Unknown',
                    subitemName: 'Unknown',
                    crew: [],
                    syncedProjectOverviewItemId: self.getVariableValue('synced-project-overview-item-id') || 'Unknown',
                    syncedRoomInfoBoard: self.getVariableValue('synced-room-info-board') || 'Unknown',
                    syncedPresentationManagementBoard: self.getVariableValue('synced-presentation-management-board') || 'Unknown',
                    syncedHelpRequestsBoard: self.getVariableValue('synced-help-requests-board') || 'Unknown'
                };
        
                // Get the my-room value
                const myRoomId = self.getVariableValue('my-room') || 'Unknown';
                self.log('info', `Request Help triggered. Fetching details for room ID: ${myRoomId}`);
                
                // Update payload with the room ID
                payload.roomId = myRoomId;

                // Create timestamp with format "roomID-timestamp"
                const unixTimestamp = Math.floor(Date.now() / 1000);
                const timestampValue = `${myRoomId}-${unixTimestamp}`;
                
                // Add timestamp to payload and update variable
                payload.timestamp = timestampValue;
                self.setVariableValues({ 
                    'help-request-status': 'help requested',
                    'help-request-timestamp': timestampValue
                });
                self.log('info', `Help request timestamp created: ${timestampValue}`);
                self.checkFeedbacks('help_request_status');
        
                // Update help request status if we at least have a room ID
                if (myRoomId !== 'Unknown') {
                    self.setVariableValues({ 'help-request-status': 'help requested' });
                    self.log('info', `Help request status updated to 'help requested' for room ID: ${myRoomId}`);
                } else {
                    self.log('warn', 'No room ID set in my-room variable. Continuing with limited information.');
                }
                self.checkFeedbacks('help_requeset_status');
                // Get the Monday API token from config
                const mondayApiToken = self.config['monday-api-token'];
                if (!mondayApiToken) {
                    self.log('error', 'Monday API Token is not set. Cannot query additional details.');
                    // Still send what we have to the webhook
                    await sendWebhookData(payload);
                    return;
                }
        
                try {
                    // Step 1: Query the item to get its group if we have a room ID
                    if (myRoomId !== 'Unknown') {
                        try {
                            const roomResponse = await fetch('https://api.monday.com/v2', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': mondayApiToken
                                },
                                body: JSON.stringify({
                                    query: `
                                        query {
                                            items(ids: [${myRoomId}]) {
                                                id
                                                name
                                                group {
                                                    id
                                                    title
                                                }
                                            }
                                        }
                                    `
                                })
                            });
        
                            if (roomResponse.ok) {
                                const roomResult = await roomResponse.json();
                                if (!roomResult.errors && roomResult.data.items && roomResult.data.items.length > 0) {
                                    const item = roomResult.data.items[0];
                                    
                                    // Update payload with room information
                                    payload.roomName = item.name || 'Unknown';
                                    
                                    if (item.group) {
                                        payload.groupId = item.group.id || 'Unknown';
                                        self.log('info', `Room '${item.name}' (ID: ${myRoomId}) belongs to group ID: ${payload.groupId}`);
                                    } else {
                                        self.log('warn', `Room ID ${myRoomId} (${item.name}) does not belong to any group.`);
                                    }
                                } else {
                                    self.log('warn', `API error or no item found for room ID: ${myRoomId}`);
                                }
                            } else {
                                self.log('warn', `HTTP error fetching room! Status: ${roomResponse.status}`);
                            }
                        } catch (error) {
                            self.log('warn', `Error fetching room details: ${error.message}`);
                            // Continue with what we have
                        }
                    }
        
                    // Step 2: Query subitems only if we have project overview ID
                    const projectOverviewId = payload.syncedProjectOverviewItemId;
                    let projectItem = null;
                    
                    if (projectOverviewId !== 'Unknown') {
                        try {
                            const subitemsResponse = await fetch('https://api.monday.com/v2', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': mondayApiToken
                                },
                                body: JSON.stringify({
                                    query: `
                                        query {
                                            items(ids: [${projectOverviewId}]) {
                                                id
                                                name
                                                subitems {
                                                    id
                                                    name
                                                    column_values {
                                                        id
                                                        text
                                                        value
                                                    }
                                                }
                                            }
                                        }
                                    `
                                })
                            });
        
                            if (subitemsResponse.ok) {
                                const subitemsResult = await subitemsResponse.json();
                                if (!subitemsResult.errors && subitemsResult.data.items && subitemsResult.data.items.length > 0) {
                                    projectItem = subitemsResult.data.items[0];
                                    self.log('info', `Found ${projectItem.subitems ? projectItem.subitems.length : 0} subitems for project overview ID: ${projectOverviewId}`);
                                } else {
                                    self.log('warn', `API error or no subitems found for project overview item ID: ${projectOverviewId}`);
                                }
                            } else {
                                self.log('warn', `HTTP error fetching subitems! Status: ${subitemsResponse.status}`);
                            }
                        } catch (error) {
                            self.log('warn', `Error fetching subitems: ${error.message}`);
                            // Continue with what we have
                        }
                    } else {
                        self.log('warn', 'No synced project overview item ID set. Cannot query subitems.');
                    }
        
                    // Step 3: Find matching subitem only if we have group ID and subitems
                    let matchingSubitem = null;
                    
                    if (payload.groupId !== 'Unknown' && projectItem && projectItem.subitems && projectItem.subitems.length > 0) {
                        for (const subitem of projectItem.subitems) {
                            const groupField = subitem.column_values.find(col => col.id === 'text_mknfse2p');
                            if (groupField && groupField.text === payload.groupId) {
                                matchingSubitem = subitem;
                                break;
                            }
                        }
        
                        if (matchingSubitem) {
                            // Update payload with matching subitem information
                            payload.subitemId = matchingSubitem.id;
                            payload.subitemName = matchingSubitem.name;
                            self.log('info', `Found matching subitem: ${matchingSubitem.name} (ID: ${matchingSubitem.id})`);
                            
                            // Step 4: Extract person IDs if available
                            const personField = matchingSubitem.column_values.find(col => col.id === 'multiple_person_mknfrr5d');
                            if (personField && personField.value && personField.value !== 'N/A') {
                                try {
                                    const personsAndTeams = JSON.parse(personField.value).personsAndTeams || [];
                                    const personIds = personsAndTeams
                                        .filter(pt => pt.kind === 'person')
                                        .map(pt => pt.id);
        
                                    if (personIds.length > 0) {
                                        self.log('info', `Assigned crew person IDs for subitem ${matchingSubitem.id}: ${personIds.join(', ')}`);
                                        
                                        // Step 5: Batch fetch all persons' details in one API call
                                        try {
                                            const userResponse = await fetch('https://api.monday.com/v2', {
                                                method: 'POST',
                                                headers: {
                                                    'Content-Type': 'application/json',
                                                    'Authorization': mondayApiToken
                                                },
                                                body: JSON.stringify({
                                                    query: `
                                                        query {
                                                            users(ids: [${personIds.join(', ')}]) {
                                                                id
                                                                name
                                                                phone
                                                                mobile_phone
                                                            }
                                                        }
                                                    `
                                                })
                                            });
        
                                            if (userResponse.ok) {
                                                const userResult = await userResponse.json();
                                                if (!userResult.errors && userResult.data.users) {
                                                    const users = userResult.data.users;
                                                    
                                                    // Collect user details for webhook
                                                    payload.crew = users.map(user => ({
                                                        id: user.id,
                                                        name: user.name,
                                                        phone: user.phone || 'Not provided',
                                                        cell_phone: user.mobile_phone || 'Not provided'
                                                    }));
        
                                                    payload.crew.forEach(crew => {
                                                        self.log('info', `Crew member: ${crew.name} (ID: ${crew.id}), Phone: ${crew.phone}, Cell Phone: ${crew.cell_phone}`);
                                                    });
                                                } else {
                                                    self.log('warn', `API error fetching users`);
                                                }
                                            } else {
                                                self.log('warn', `HTTP error fetching users! Status: ${userResponse.status}`);
                                            }
                                        } catch (error) {
                                            self.log('warn', `Error fetching user details: ${error.message}`);
                                            // Continue with what we have
                                        }
                                    } else {
                                        self.log('warn', `No person IDs found in multiple_person_mknfrr5d for subitem ${matchingSubitem.id}`);
                                    }
                                } catch (error) {
                                    self.log('warn', `Failed to parse multiple_person_mknfrr5d value: ${error.message}`);
                                }
                            } else {
                                self.log('warn', `No assigned crew found in subitem ${matchingSubitem.id}`);
                            }
                        } else {
                            self.log('warn', `No subitem found with text_mknfse2p matching group ID: ${payload.groupId}`);
                        }
                    }
        
                    // Step 6: Send data to webhook with all available information
                    await sendWebhookData(payload);
        
                } catch (error) {
                    self.log('error', `Failed during Request Help action: ${error.message}`);
                    // Send whatever data we collected so far
                    await sendWebhookData(payload);
                }
        
                // Helper function to send data to webhook
                async function sendWebhookData(data) {
                    try {
                        const webhookUrl = 'https://hook.us2.make.com/kboux2kuf6plzh89l4b7lgnot1g2gsq1';
                        
                        self.log('info', `Sending help request data to webhook: ${JSON.stringify(data, null, 2)}`);
        
                        const webhookResponse = await fetch(webhookUrl, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify(data)
                        });
        
                        if (webhookResponse.ok) {
                            self.log('info', `Successfully sent help request to webhook. Status: ${webhookResponse.status}`);
                        } else {
                            self.log('error', `Webhook error! Status: ${webhookResponse.status}`);
                        }
                    } catch (error) {
                        self.log('error', `Failed to send webhook: ${error.message}`);
                    }
                }
            }
        }
    });
};