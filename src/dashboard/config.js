// Shared configuration and constants for the game visualization dashboard

// Platform colors mapping
export const PLATFORM_COLORS = {
  PS5: 'var(--platform-ps5)',
  Switch: 'var(--platform-switch)',
  Xbox: 'var(--platform-xbox)',
  GOG: 'var(--platform-gog)',
  Steam: 'var(--platform-steam)',
};

// Get platform color with fallback
export function getPlatformColor(platform) {
  return PLATFORM_COLORS[platform] || '#999999';
}

// Shared zoom configuration
export const ZOOM_CONFIG = {
  scaleExtent: [0.5, 10],
  translateExtentMultiplier: 2,
};
