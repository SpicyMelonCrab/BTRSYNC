const { combineRgb } = require('@companion-module/base');

module.exports = function (self) {
    const presets = {
        // Force Sync (unchanged for now)
        'force_sync': {
            type: 'button',
            category: 'Sync Control',
            label: 'Force Sync',
            style: {
                text: 'Force Sync',
                size: '18',
                color: combineRgb(255, 255, 255),
                bgcolor: combineRgb(0, 0, 0)
            },
            steps: [
                {
                    down: [{ actionId: 'force_sync', options: {} }],
                    up: []
                }
            ],
            feedbacks: [{ feedbackId: 'last_sync_status', options: {} }]
        },

        // Toggle Auto Sync (updated feedback style)
        'toggle_auto_sync': {
            type: 'button',
            category: 'Sync Control',
            label: 'Toggle Auto Sync',
            style: {
                text: 'Auto Sync\n$(autosyncmodule:auto-sync)',
                size: '14',
                color: combineRgb(255, 255, 255),
                bgcolor: combineRgb(0, 0, 0) // Black when disabled
            },
            steps: [
                {
                    down: [{ actionId: 'toggle_auto_sync', options: {} }],
                    up: []
                }
            ],
            feedbacks: [
                {
                    feedbackId: 'auto_sync_status',
                    options: {},
                    style: {
                        bgcolor: combineRgb(0, 200, 255) // Blue when enabled
                    }
                }
            ]
        },

        // Toggle Time Mode (updated feedback style)
        'toggle_time_mode': {
            type: 'button',
            category: 'Presentation Control',
            label: 'Toggle Time Mode',
            style: {
                text: 'Time Mode\n$(autosyncmodule:time-mode)',
                size: '14',
                color: combineRgb(255, 255, 255),
                bgcolor: combineRgb(0, 0, 0) // Black when disabled
            },
            steps: [
                {
                    down: [{ actionId: 'toggle_time_mode', options: {} }],
                    up: []
                }
            ],
            feedbacks: [
                {
                    feedbackId: 'time_mode_status',
                    options: {},
                    style: {
                        bgcolor: combineRgb(200, 100, 255) // Purple when enabled
                    }
                }
            ]
        },

        // Switch to Previous Presentation (unchanged for now)
        'switch_to_previous': {
            type: 'button',
            category: 'Presentation Control',
            label: 'Previous Presentation',
            style: {
                text: 'Previous\n$(autosyncmodule:time-mode-disabled-presentation-position)',
                size: '14',
                color: combineRgb(255, 255, 255),
                bgcolor: combineRgb(0, 102, 204)
            },
            steps: [
                {
                    down: [{ actionId: 'switch_to_previous', options: {} }],
                    up: []
                }
            ],
            feedbacks: [{ feedbackId: 'time_mode_status', options: {} }]
        },

        // Switch to Next Presentation (unchanged for now)
        'switch_to_next': {
            type: 'button',
            category: 'Presentation Control',
            label: 'Next Presentation',
            style: {
                text: 'Next\n$(autosyncmodule:time-mode-disabled-presentation-position)',
                size: '14',
                color: combineRgb(255, 255, 255),
                bgcolor: combineRgb(0, 102, 204)
            },
            steps: [
                {
                    down: [{ actionId: 'switch_to_next', options: {} }],
                    up: []
                }
            ],
            feedbacks: [{ feedbackId: 'time_mode_status', options: {} }]
        },

        // Begin Current Presentation (unchanged for now)
        'begin_current_presentation': {
            type: 'button',
            category: 'Presentation Control',
            label: 'Begin Pres',
            style: {
                text: 'Begin Curr. Presentation',
                size: '18',
                color: combineRgb(255, 255, 255),
                bgcolor: combineRgb(255, 0, 0)
            },
            steps: [
                {
                    down: [{ actionId: 'begin_current_presentation', options: {} }],
                    up: []
                }
            ],
            feedbacks: [
                { feedbackId: 'current_presentation_active', options: {} },
                { feedbackId: 'presentation_nearing_end', options: {} }
            ]
        },

        // Remove Last Letter from Password (unchanged)
        'remove_last_letter_from_password': {
            type: 'button',
            category: 'Password Control',
            label: 'Remove Letter',
            style: {
                text: 'Backspace\n$(autosyncmodule:presentation-password-input)',
                size: '14',
                color: combineRgb(255, 255, 255),
                bgcolor: combineRgb(204, 0, 0)
            },
            steps: [
                {
                    down: [{ actionId: 'remove_last_letter_from_password', options: {} }],
                    up: []
                }
            ]
        },

        // Reset Sync (unchanged for now)
        'reset_sync': {
            type: 'button',
            category: 'Sync Control',
            label: 'Reset Sync',
            style: {
                text: 'Reset Sync',
                size: '18',
                color: combineRgb(255, 255, 255),
                bgcolor: combineRgb(255, 0, 0)
            },
            steps: [
                {
                    down: [{ actionId: 'reset_sync', options: {} }],
                    up: []
                }
            ],
            feedbacks: [{ feedbackId: 'last_sync_status', options: {} }]
        },

        // Lookup Presentation by Password (unchanged)
        'lookup_presentation_by_password': {
            type: 'button',
            category: 'Password Control',
            label: 'Lookup Pres',
            style: {
                text: 'Enter\n$(autosyncmodule:presentation-password-input)',
                size: '14',
                color: combineRgb(255, 255, 255),
                bgcolor: combineRgb(0, 153, 153)
            },
            steps: [
                {
                    down: [{ actionId: 'lookup_presentation_by_password', options: {} }],
                    up: []
                }
            ]
        }
    };

    // Dynamically add 26 presets for each letter (A-Z) - unchanged
    for (let i = 0; i < 26; i++) {
        const letter = String.fromCharCode(65 + i);
        presets[letter.toLowerCase()] = {
            type: 'button',
            category: 'Password Control',
            label: letter,
            style: {
                text: letter,
                size: '18',
                color: combineRgb(255, 255, 255),
                bgcolor: combineRgb(0, 153, 76)
            },
            steps: [
                {
                    down: [
                        {
                            actionId: 'add_letter_to_password',
                            options: { letter: letter }
                        }
                    ],
                    up: []
                }
            ]
        };
    }

    return presets;
};