# RedditShield

RedditShield is a Chrome extension that provides content filtering for Reddit. Filter specific users, keywords, subreddits, and domains with cross-device synchronization.

## Features

- **User Filtering:** Hide posts and comments from specific users
- **Keyword Filtering:** Hide posts containing specific keywords
- **Subreddit Filtering:** Hide posts from specific subreddits
- **Domain Filtering:** Hide posts from specific domains
- **Badge Counter:** Real-time count of filtered items on extension icon
- **Smart Cleanup Buttons:** Per-list buttons to manage filters from current page
- **Thread Cleanup:** Filter all users from the current thread
- **Cross-Device Sync:** Sync filters across Chrome installations
- **Debug Logging:** Colored console logging for debugging

## Installation

### From Source
1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" at the top right corner
4. Click "Load unpacked" and select the `src/` folder
5. The extension should now appear in your list of extensions and is ready to use

### From Release
1. Download the `RedditShield.zip` file from releases
2. Extract and follow steps 2-5 above

## Usage

Click the RedditShield icon in the Chrome toolbar to access the popup interface:

### Filter Management
- **Filtered Users:** Enter usernames, one per line ("u/" prefix optional)
- **Filtered Keywords:** Enter keywords, one per line
- **Filtered Subreddits:** Enter subreddit names, one per line ("r/" prefix optional)
- Each filter type can be toggled independently

### Cleanup Buttons
Each filter list has its own cleanup button:
- **Keywords:** "Clear from current page" - Removes keywords appearing in visible posts
- **Subreddits:** "Clear from current page" - Removes subreddits appearing in visible posts
- **Users:** "Filter current thread" - Adds all visible users from the current thread

### Badge Counter
- Shows total filtered items on the extension icon
- Real-time updates as content loads
- Accumulates count as you scroll
- Resets only on page navigation
- Format: "0" to "999" or "999+" for large counts

### Preferences
- **Print Logs:** Enable console logging for debugging
- **Sync Across Devices:** Use Chrome sync storage instead of local storage

Settings save automatically and apply to current and future sessions.

## Project Structure

```
reddit-shield/
├── src/                    # Extension source files
│   ├── assets/            # Icons and images
│   ├── manifest.json      # Extension configuration
│   ├── background.js      # Service worker for badge management
│   ├── reddit-shield.js   # Content script for filtering
│   ├── popup.html         # Popup interface
│   ├── popup.js           # Popup controller
│   ├── popup.css          # Popup styling
│   └── LICENSE
├── dist/                  # Build artifacts (git-ignored)
├── .gitignore
└── README.md
```

## Technical Implementation

### Filtering Process

RedditShield uses a multi-stage filtering approach:

1. **Storage Management**: Filters are stored in Chrome storage (local or sync). The extension automatically detects the user's sync preference and loads from the appropriate storage area.

2. **DOM Detection**: The content script detects Reddit's design (old vs new) by checking `window.location.hostname` and applies design-specific selectors.

3. **Content Filtering**:
   - **Posts**: Filtered on listing pages (`/r/subreddit`, `/popular`, etc.) but not on thread pages (`/comments/`)
   - **Comments**: Filtered only on thread pages when user filtering is enabled
   - **Performance**: Only processes visible elements (display !== "none") to avoid O(n^2) complexity

4. **Filter Application**: Matching elements are hidden using `element.style.display = "none"`

### Data Structures

- **Sets** are used for filter storage to provide O(1) lookup performance
- **MutationObserver** monitors DOM changes for dynamic content (infinite scroll, AJAX loading)
- **Debouncing** prevents excessive filtering on rapid DOM mutations

### Input Processing

- User inputs are cleaned (trimmed, case-normalized)
- Reddit prefixes ("u/", "r/") are automatically stripped
- Domain filtering uses regex to extract base domains from URLs
- Empty entries are filtered out

### Thread Cleanup Implementation

The thread cleanup feature:
1. Queries all post and comment elements on the current page
2. Extracts author attributes using design-specific selectors
3. Filters out users already in the filter list
4. Returns unique usernames to the popup for storage
5. Immediately applies filtering to prevent visual delay

### Cross-Device Synchronization

- Uses Chrome's `chrome.storage.sync` API when enabled
- Falls back to `chrome.storage.local` when sync is disabled
- Sync preference is always stored locally to bootstrap the decision
- Data migration occurs automatically when switching between storage types


## Permissions

RedditShield requires the following permissions:

- `storage`: To save your preferences locally on your device
- `activeTab`: To apply filters and enhancements to the Reddit pages you visit
- `tabs`: To update the badge counter on the extension icon

## Version History

### Version 1.51 (2025-10-08)
- **Reddit-Only Operation:** Extension now only functions on reddit.com and its subdomains
- **Popup Protection:** Popup automatically closes when not on Reddit

### Version 1.5 (2025-10-08)
- **Badge Counter:** Real-time filtered items counter on extension icon
- **Close Button:** Added × button to popup header for easy closing
- **Smart Cleanup Buttons:** Per-list cleanup buttons for keywords and subreddits
- **Improved Accuracy:** Badge counter accumulates properly across page scrolling
- **Better UX:** Visual feedback showing filtering effectiveness


## Privacy

Filters are stored locally or in Chrome's sync storage. The extension operates client-side with no external data transmission.

## Attribution

- **Project Idea from:** [redditFilters](https://github.com/JosephKan3/redditFilters) by Joseph Jiayi Kan
- **Programmed by:** Vanco Ordanoski <vordan@infoproject.biz>

## Contributing

Submit issues and suggestions at: [https://github.com/vordan/reddit-shield](https://github.com/vordan/reddit-shield)

## License

This project is licensed under the MIT License - see the [LICENSE](src/LICENSE) file for details.

Copyright (c) 2025 Vanco Ordanoski
