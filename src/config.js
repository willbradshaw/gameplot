// Shared configuration and constants for the game visualization dashboard

// Platform colors mapping
export const PLATFORM_COLORS = {
    'PS5': '#eeeeee', 
    'Switch': '#96ceb4',
    'Xbox': '#85E34A',
    'GOG': '#FC7EFF',
    'Steam': '#7EBBFF'
};

// Get platform color with fallback
export function getPlatformColor(platform) {
    return PLATFORM_COLORS[platform] || '#999999';
}

// Shared zoom configuration
export const ZOOM_CONFIG = {
    scaleExtent: [0.5, 10],
    translateExtentMultiplier: 2
}; 