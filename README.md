# 🎮 Video Game Journey Visualization

An interactive dashboard for analyzing your video game playing patterns and preferences over time. Features three complementary visualizations: timeline scatter plot, rating distribution by tags, and playtime vs rating analysis.

![Dashboard Preview](https://via.placeholder.com/800x400/2d2b55/ffffff?text=Video+Game+Dashboard)

## ✨ Features

- **Timeline View**: Scatter plot showing games over time with rating trends
- **Tag Analysis**: Box plots revealing rating distributions by game genres/tags  
- **Playtime Analysis**: Scatter plot exploring the relationship between time invested and ratings
- **Interactive Filtering**: Multi-select filters for platforms, tags, status, and date ranges
- **Responsive Design**: Works on desktop and mobile devices
- **Zoom & Pan**: Navigate through your gaming timeline with smooth interactions
- **Rich Tooltips**: Detailed information on hover including tags, dates, and notes

## 🗂️ Project Structure

```
video-game-dashboard/
├── index.html          # Main HTML template
├── styles.css          # All styling and visual design
├── script.js           # Core visualization logic and interactions
├── games.json          # Sample data in JSON format
└── README.md           # This file
```

## 🚀 Quick Start

1. **Clone this repository**
   ```bash
   git clone <your-repo-url>
   cd video-game-dashboard
   ```

2. **Open in browser**
   ```bash
   # Simple local server (Python 3)
   python -m http.server 8000
   
   # Or with Node.js
   npx serve .
   
   # Then open http://localhost:8000
   ```

3. **Replace sample data** (see Data Setup section below)

## 📊 Data Setup

### JSON Format (Recommended)
The dashboard loads data from `games.json` by default. Your JSON should be an array of game objects with these properties:

| Property | Type | Description | Example |
|----------|------|-------------|---------|
| `game` | String | Game title | "The Legend of Zelda: Breath of the Wild" |
| `platform` | String | Gaming platform | "PC", "PS5", "Switch", "Xbox" |
| `tags` | Array | Array of tags | ["Action-Adventure", "Open World", "Nintendo"] |
| `rating` | Number | Your rating (0-10) | 9.5 |
| `firstPlayed` | String | First play date (ISO format) | "2023-03-01" |
| `lastPlayed` | String | Last play date (ISO format) | "2023-03-15" |
| `hoursPlayed` | Number | Total hours played | 120 |
| `status` | String | Completion status | "Completed", "In Progress", "Abandoned" |
| `notes` | String | Personal notes | "Absolutely breathtaking open world" |

**Quick Start:** Replace the contents of `games.json` with your own data and refresh the page!

**Example JSON structure:**
```json
[
  {
    "game": "Elden Ring",
    "platform": "PC",
    "tags": ["Soulslike", "RPG", "Open World", "Fantasy"],
    "rating": 9.7,
    "firstPlayed": "2022-04-01",
    "lastPlayed": "2022-05-14",
    "hoursPlayed": 140,
    "status": "Completed",
    "notes": "FromSoftware masterpiece"
  },
  {
    "game": "Hades",
    "platform": "PC",
    "tags": ["Roguelike", "Action", "Indie"],
    "rating": 9.2,
    "firstPlayed": "2022-10-15",
    "lastPlayed": "2022-11-08",
    "hoursPlayed": 95,
    "status": "Completed",
    "notes": "Perfect gameplay loop"
  }
]
```

**💡 Why JSON over CSV?**
- **🏷️ Native array support** - Tags are proper arrays, not comma-separated strings
- **🚀 Better performance** - No parsing overhead, direct JavaScript objects
- **🔧 Type safety** - Numbers stay numbers, booleans stay booleans
- **📝 More readable** - Easier to edit and validate
- **🌐 API-friendly** - Standard format for web APIs and modern data exchange

### S3 Integration
To load data from AWS S3, update the `loadData()` function in `script.js`:

```javascript
async function loadData() {
    try {
        // Change this URL to your S3 JSON file
        const response = await fetch('https://your-bucket.s3.amazonaws.com/games.json');
        const jsonData = await response.json();
        // ... rest of function stays the same
    } catch (error) {
        console.error('Error loading data:', error);
    }
}
```

### API Integration
You can also load from any REST API that returns JSON:

```javascript
// Replace with your API endpoint
const response = await fetch('https://api.example.com/my-games');
const jsonData = await response.json();
```

## 🎛️ Customization

### Platform Colors
Edit the `getPlatformColor()` function in `script.js`:

```javascript
const getPlatformColor = (platform) => {
    const colors = {
        'PC': '#ff6b6b',      // Red
        'PS4': '#4ecdc4',     // Teal  
        'PS5': '#45b7d1',     // Blue
        'Switch': '#96ceb4',  // Green
        'Xbox': '#ffeaa7',    // Yellow
        'Mobile': '#fd79a8'   // Pink (add new platforms)
    };
    return colors[platform] || '#ddd';
};
```

### Visual Styling
Customize colors and appearance in `styles.css`:

```css
/* Change main background gradient */
body {
    background: linear-gradient(135deg, #your-color-1 0%, #your-color-2 100%);
}

/* Modify tooltip styling */
.tooltip {
    background: rgba(0,0,0,0.9);
    border: 1px solid rgba(255,255,255,0.2);
}
```

### Chart Dimensions
Adjust chart sizes in `script.js`:

```javascript
// Timeline chart
const width = 1200 - margin.left - margin.right;
const height = 600 - margin.top - margin.bottom;

// Playtime chart  
const playtimeWidth = 1200 - playtimeMargin.left - playtimeMargin.right;
const playtimeHeight = 600 - playtimeMargin.top - playtimeMargin.bottom;
```

## 🔧 Dependencies

- **D3.js v7.8.5** - Data visualization library (loaded from CDN)
- **Modern browser** with ES6+ support

No build process or package manager required!

## 📱 Browser Support

- ✅ Chrome 80+
- ✅ Firefox 75+  
- ✅ Safari 13+
- ✅ Edge 80+

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

## 🙏 Acknowledgments

- Built with [D3.js](https://d3js.org/) for powerful data visualizations
- Inspired by modern gaming analytics dashboards
- Sample data includes popular games from recent years

---

**Ready to explore your gaming journey?** Replace the sample data with your own and discover patterns in your gaming preferences! 🎮✨