/*
 * RedditShield Background Service Worker
 *
 * Handles badge counter updates showing the number of filtered items on the current page.
 * Receives messages from the content script with filter counts and updates the extension
 * icon badge accordingly.
 *
 * Features:
 * - Per-tab filtered item tracking
 * - Real-time badge updates
 * - Teal badge color matching extension theme
 * - Compact display for large numbers (999+)
 *
 * @version 1.51
 * @author Vanco Ordanoski <vordan@infoproject.biz>
 * @date 2025-10-08
 */

// Initialize badge color on installation
chrome.runtime.onInstalled.addListener(function() {
	// Set badge background color to match extension theme (teal)
	chrome.action.setBadgeBackgroundColor({ color: '#008b8b' });
});

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener(function(_request, _sender, _send_response) {
	// Handle filter count updates
	if (_request.action === 'updateBadge') {
		const _tab_id = _sender.tab.id;
		const _count = _request.count || 0;

		// Format count for display
		let _badge_text = '';
		if (_count > 0) {
			if (_count > 999) {
				_badge_text = '999+';
			} else {
				_badge_text = _count.toString();
			}
		}

		// Update badge for the specific tab
		chrome.action.setBadgeText({
			text: _badge_text,
			tabId: _tab_id
		});

		_send_response({ status: 'success' });
	}

	return true; // Keep message channel open for async response
});

// Clear badge when tab is closed
chrome.tabs.onRemoved.addListener(function(_tab_id) {
	chrome.action.setBadgeText({
		text: '',
		tabId: _tab_id
	});
});

// Reset badge when navigating to non-Reddit pages
chrome.tabs.onUpdated.addListener(function(_tab_id, _change_info, _tab) {
	if (_change_info.status === 'loading' && _tab.url) {
		// Clear badge if not on Reddit
		if (!_tab.url.includes('reddit.com')) {
			chrome.action.setBadgeText({
				text: '',
				tabId: _tab_id
			});
		}
	}
});
