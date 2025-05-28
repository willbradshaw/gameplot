// Shared configuration and constants for the game visualization dashboard

// Platform colors mapping
export const PLATFORM_COLORS = {
    'PC': '#ff6b6b',
    'PS4': '#4ecdc4',
    'PS5': '#45b7d1', 
    'Switch': '#96ceb4',
    'Xbox': '#ffeaa7'
};

// Get platform color with fallback
export function getPlatformColor(platform) {
    return PLATFORM_COLORS[platform] || '#ddd';
}

// Shared zoom configuration
export const ZOOM_CONFIG = {
    scaleExtent: [0.5, 10],
    translateExtentMultiplier: 2
}; 