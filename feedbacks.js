const { combineRgb } = require('@companion-module/base')

module.exports = function (self) {
    self.setFeedbackDefinitions({
        current_presentation_active: {
            type: 'boolean',
            name: 'Current Presentation Active',
            description: 'Changes button color when a presentation is in progress.',
            defaultStyle: {
                bgcolor: combineRgb(0, 255, 0), // Green when active
                color: combineRgb(0, 0, 0),
            },
            callback: (feedback) => {
                const actualStartTime = self.getVariableValue('current-presentation-actual-start-time');
                return actualStartTime !== 'None'; // Active if start time is set
            },
        },
        presentation_nearing_end: {
            type: 'boolean',
            name: 'Presentation Nearing End',
            description: 'Changes button color when less than 5 minutes remain.',
            defaultStyle: {
                bgcolor: combineRgb(255, 0, 0), // Red when active
                color: combineRgb(255, 255, 255),
            },
            callback: (feedback) => {
                const duration = self.getVariableValue('current-presentation-actual-duration');
                if (duration === 'None') return false;
                const remainingTime = parseFloat(duration);
                return remainingTime <= 5; // Active if <= 5 minutes remaining
            },
        },
        auto_sync_status: {
            type: 'boolean',
            name: 'Auto Sync On/Off',
            description: 'Shows blue when enabled, black when disabled',
            defaultStyle: {
                bgcolor: combineRgb(0, 200, 255),
                color: combineRgb(255, 255, 255)
            },
            callback: (feedback) => {
                const autoSync = self.getVariableValue('auto-sync');
                return autoSync === 'enabled';
            }
        },
        time_mode_status: {
            type: 'boolean',
            name: 'Time Mode On/Off',
            description: 'Shows purple when enabled, black when disabled',
            defaultStyle: {
                bgcolor: combineRgb(200, 100, 255),
                color: combineRgb(255, 255, 255)
            },
            callback: (feedback) => {
                const timeMode = self.getVariableValue('time-mode');
                return timeMode === 'enabled';
            }
        },
		last_sync_status: {
            type: 'advanced',
            name: 'Sync Status',
            description: 'Shows colors based on sync status',
            options: [],
            callback: (feedback) => {
                const syncStatus = self.getVariableValue('board-sync-status');
                self.log('debug', `Sync Status Feedback - Current Status: ${syncStatus}`);

                // Log before returning each color
                if (syncStatus === 'Synced') {
                    self.log('debug', `Returning GREEN for Synced status`);
                    return {
                        bgcolor: combineRgb(0, 255, 0),
                        color: combineRgb(255, 255, 255)
                    };
                }
                if (syncStatus === 'Offline') {
                    self.log('debug', `Returning YELLOW for Offline status`);
                    return {
                        bgcolor: combineRgb(255, 255, 0),
                        color: combineRgb(0, 0, 0)
                    };
                }
                if (syncStatus === 'Last Sync Failed') {
                    self.log('debug', `Returning RED for Failed status`);
                    return {
                        bgcolor: combineRgb(255, 0, 0),
                        color: combineRgb(255, 255, 255)
                    };
                }

                self.log('debug', `Returning BLACK for unknown status: ${syncStatus}`);
                return {
                    bgcolor: combineRgb(0, 0, 0),
                    color: combineRgb(255, 255, 255)
                };
            }
        }
    });
}