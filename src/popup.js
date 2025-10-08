/*
 * RedditShield Popup Controller
 *
 * This module manages the extension's popup interface and handles user interactions
 * with filtering controls. It manages filtered users, keywords, and subreddits,
 * along with preference settings for logging and sync.
 *
 * Key functionality:
 * - Data persistence using Chrome Storage API (local or sync)
 * - Real-time saving of filter lists and preferences
 * - Thread cleanup feature to mass-filter users from current thread
 * - Migration between local and sync storage when preferences change
 * - Input validation and cleanup (removes prefixes like "u/" and "r/")
 *
 * Storage structure:
 * - hiddenUsers: Array of usernames to filter
 * - hiddenKeywords: Array of keywords to filter from post titles
 * - hiddenSubreddits: Array of subreddit names to filter
 * - hiddenDomains: Array of domains to filter (currently hidden feature)
 * - Preference flags: loggingEnabled, filterUsers, filterKeywords, filterSubreddits, filterDomains
 * - enableSync: Controls whether to use chrome.storage.sync or chrome.storage.local
 *
 * @version 1.51
 * @author Vanco Ordanoski <vordan@infoproject.biz>
 * @date 2025-10-08
 */
const cls_redditShieldPopup = function(_options) {
	// Storage configuration keys
	let __storage_keys = [
		"hiddenUsers", "hiddenKeywords", "hiddenSubreddits", "hiddenDomains",
		"loggingEnabled", "filterUsers", "filterKeywords", "filterSubreddits", "filterDomains"
	];

	// Initialize the popup controller
	function _initialize() {
		// Check if current tab is on Reddit
		chrome.tabs.query({ active: true, currentWindow: true }, function(_tabs) {
			if (!_tabs[0] || !_tabs[0].url || !_tabs[0].url.includes('reddit.com')) {
				// Not on Reddit - close popup immediately
				window.close();
				return;
			}
			// On Reddit - continue with normal initialization
			_events_render();
			_data_load();
		});
	}

	// Set up event listeners for UI controls
	function _events_render() {
		// Event listener for close button
		const _close_button = document.getElementById("closeButton");
		if (_close_button) {
			_close_button.addEventListener("click", function() {
				window.close();
			});
		}

		// Event listeners for text input fields
		document.getElementById("userList").addEventListener("input", _data_save);
		document.getElementById("keywordList").addEventListener("input", _data_save);
		document.getElementById("subredditList").addEventListener("input", _data_save);
		document.getElementById("domainList").addEventListener("input", _data_save);

		// Event listeners for checkbox controls
		document.getElementById("loggingEnabled").addEventListener("change", _data_save);
		document.getElementById("filterUsers").addEventListener("change", _data_save);
		document.getElementById("filterKeywords").addEventListener("change", _data_save);
		document.getElementById("filterSubreddits").addEventListener("change", _data_save);
		document.getElementById("filterDomains").addEventListener("change", _data_save);
		document.getElementById("enableSync").addEventListener("change", _data_save);

		// Event listeners for cleanup buttons
		document.addEventListener("DOMContentLoaded", function() {
			const _users_button = document.getElementById("cleanupUsersButton");
			if (_users_button) {
				_users_button.addEventListener("click", _cleanup_users_execute);
			}

			const _keywords_button = document.getElementById("cleanupKeywordsButton");
			if (_keywords_button) {
				_keywords_button.addEventListener("click", _cleanup_keywords_execute);
			}

			const _subreddits_button = document.getElementById("cleanupSubredditsButton");
			if (_subreddits_button) {
				_subreddits_button.addEventListener("click", _cleanup_subreddits_execute);
			}
		});
	}

	// Get storage area based on sync preferences
	function _storage_area_get() {
		const _enable_sync = document.getElementById("enableSync").checked;
		return _enable_sync ? chrome.storage.sync : chrome.storage.local;
	}

	// Save data to storage
	function _data_save() {
		// Get data from input fields
		const _users_string = document.getElementById("userList").value;
		const _users_array = _users_string.split("\n").map(item => item.trim());

		const _keywords_string = document.getElementById("keywordList").value;
		const _keywords_array = _keywords_string.split("\n").map(item => item.trim());

		const _subreddits_string = document.getElementById("subredditList").value;
		const _subreddits_array = _subreddits_string.split("\n").map(item => item.trim());

		const _domains_string = document.getElementById("domainList").value;
		const _domains_array = _domains_string.split("\n").map(item => item.trim());

		// Get preferences from checkbox controls
		const _logging_enabled = document.getElementById("loggingEnabled").checked;
		const _filter_users = document.getElementById("filterUsers").checked;
		const _filter_keywords = document.getElementById("filterKeywords").checked;
		const _filter_subreddits = document.getElementById("filterSubreddits").checked;
		const _filter_domains = document.getElementById("filterDomains").checked;
		const _enable_sync = document.getElementById("enableSync").checked;

		// Data object to save
		const _data_to_save = {
			hiddenUsers: _users_array,
			hiddenKeywords: _keywords_array,
			hiddenSubreddits: _subreddits_array,
			hiddenDomains: _domains_array,
			loggingEnabled: _logging_enabled,
			filterUsers: _filter_users,
			filterKeywords: _filter_keywords,
			filterSubreddits: _filter_subreddits,
			filterDomains: _filter_domains,
			enableSync: _enable_sync
		};

		// Save sync preference to local storage first
		chrome.storage.local.set({ enableSync: _enable_sync });

		// Save data using the appropriate storage area
		const _storage_area = _storage_area_get();
		_storage_area.set(_data_to_save);

		// Migrate data if needed between storage areas
		_data_migrate(_enable_sync, _data_to_save);
	}

	// Migrate data between storage areas when switching
	function _data_migrate(_enable_sync, _data_to_save) {
		// Clear data from the other storage area to avoid conflicts
		const _other_storage_area = _enable_sync ? chrome.storage.local : chrome.storage.sync;
		const _keys_to_remove = [
			"hiddenUsers", "hiddenKeywords", "hiddenSubreddits", "hiddenDomains",
			"loggingEnabled", "expandImages", "filterUsers", "filterKeywords",
			"filterSubreddits", "filterDomains", "blockUsers", "blockKeywords",
			"blockSubreddits", "blockDomains"
		];
		_other_storage_area.remove(_keys_to_remove);
	}

	// Load saved data from storage
	function _data_load() {
		// First get sync preference from local storage
		chrome.storage.local.get(["enableSync"], function(_local_result) {
			const _enable_sync = _local_result.enableSync !== undefined ? _local_result.enableSync : true;
			document.getElementById("enableSync").checked = _enable_sync;

			// Determine which storage area to use
			const _storage_area = _enable_sync ? chrome.storage.sync : chrome.storage.local;

			// Load the saved data
			_storage_area.get(__storage_keys, function(_result) {
				// Populate user filter list
				if (_result.hiddenUsers) {
					document.getElementById("userList").value = _result.hiddenUsers.join("\n");
				}

				// Populate keyword filter list
				if (_result.hiddenKeywords) {
					document.getElementById("keywordList").value = _result.hiddenKeywords.join("\n");
				}

				// Populate subreddit filter list
				if (_result.hiddenSubreddits) {
					document.getElementById("subredditList").value = _result.hiddenSubreddits.join("\n");
				}

				// Populate domain filter list
				if (_result.hiddenDomains) {
					document.getElementById("domainList").value = _result.hiddenDomains.join("\n");
				}

				// Load preference checkboxes
				if (_result.loggingEnabled !== undefined) {
					document.getElementById("loggingEnabled").checked = _result.loggingEnabled;
				}
				if (_result.filterUsers !== undefined) {
					document.getElementById("filterUsers").checked = _result.filterUsers;
				}
				if (_result.filterKeywords !== undefined) {
					document.getElementById("filterKeywords").checked = _result.filterKeywords;
				}
				if (_result.filterSubreddits !== undefined) {
					document.getElementById("filterSubreddits").checked = _result.filterSubreddits;
				}
				if (_result.filterDomains !== undefined) {
					document.getElementById("filterDomains").checked = _result.filterDomains;
				}
			});
		});
	}

	// Execute users cleanup functionality (filter thread)
	function _cleanup_users_execute() {
		// Query the active tab to send cleanup message
		chrome.tabs.query({ active: true, currentWindow: true }, function(_tabs) {
			try {
				// Send cleanup request to content script
				chrome.tabs.sendMessage(
					_tabs[0].id,
					{ action: "cleanupUsers" },
					function(_response) {
						// Handle response from content script
						if (!_response || _response.status != 200) {
							document.getElementById("cleanupUsersDescription").innerHTML =
								"Can only filter when window is on a reddit thread";
							return;
						}

						const _found_users = _response.message;
						// Add all found users to the filter list
						const _users_string = document.getElementById("userList").value;
						const _users_array = _users_string.split("\n").map(item => item.trim());
						const _combined_users_array = [..._found_users, ..._users_array];

						// Save the combined user list to storage
						chrome.storage.local.get(["enableSync"], function(_result) {
							const _enable_sync = _result.enableSync !== undefined ? _result.enableSync : true;
							const _storage_area = _enable_sync ? chrome.storage.sync : chrome.storage.local;

							_storage_area.set({
								hiddenUsers: _combined_users_array
							});
						});

						// Display the combined users in UI
						document.getElementById("userList").value = _combined_users_array.join("\n");
					}
				);
			} catch (_err) {
				// Silently handle any errors
			}
		});
	}

	// Execute keywords cleanup functionality (remove from current page)
	function _cleanup_keywords_execute() {
		// Query the active tab to send cleanup message
		chrome.tabs.query({ active: true, currentWindow: true }, function(_tabs) {
			try {
				// Send cleanup request to content script
				chrome.tabs.sendMessage(
					_tabs[0].id,
					{ action: "cleanupKeywords" },
					function(_response) {
						// Handle response from content script
						if (!_response || _response.status != 200) {
							return;
						}

						const _found_keywords = _response.message;
						// Remove found keywords from the filter list
						const _keywords_string = document.getElementById("keywordList").value;
						const _keywords_array = _keywords_string.split("\n").map(item => item.trim());
						const _filtered_keywords = _keywords_array.filter(k => !_found_keywords.includes(k.toLowerCase()));

						// Save the filtered keyword list to storage
						chrome.storage.local.get(["enableSync"], function(_result) {
							const _enable_sync = _result.enableSync !== undefined ? _result.enableSync : true;
							const _storage_area = _enable_sync ? chrome.storage.sync : chrome.storage.local;

							_storage_area.set({
								hiddenKeywords: _filtered_keywords
							});
						});

						// Display the filtered keywords in UI
						document.getElementById("keywordList").value = _filtered_keywords.join("\n");
					}
				);
			} catch (_err) {
				// Silently handle any errors
			}
		});
	}

	// Execute subreddits cleanup functionality (remove from current page)
	function _cleanup_subreddits_execute() {
		// Query the active tab to send cleanup message
		chrome.tabs.query({ active: true, currentWindow: true }, function(_tabs) {
			try {
				// Send cleanup request to content script
				chrome.tabs.sendMessage(
					_tabs[0].id,
					{ action: "cleanupSubreddits" },
					function(_response) {
						// Handle response from content script
						if (!_response || _response.status != 200) {
							return;
						}

						const _found_subreddits = _response.message;
						// Remove found subreddits from the filter list
						const _subreddits_string = document.getElementById("subredditList").value;
						const _subreddits_array = _subreddits_string.split("\n").map(item => item.trim());
						const _filtered_subreddits = _subreddits_array.filter(s => !_found_subreddits.includes(s.toLowerCase()));

						// Save the filtered subreddit list to storage
						chrome.storage.local.get(["enableSync"], function(_result) {
							const _enable_sync = _result.enableSync !== undefined ? _result.enableSync : true;
							const _storage_area = _enable_sync ? chrome.storage.sync : chrome.storage.local;

							_storage_area.set({
								hiddenSubreddits: _filtered_subreddits
							});
						});

						// Display the filtered subreddits in UI
						document.getElementById("subredditList").value = _filtered_subreddits.join("\n");
					}
				);
			} catch (_err) {
				// Silently handle any errors
			}
		});
	}

	// Public object for future extensibility
	var pub = {
		// Public methods can be added here in the future
	};

	// Initialize the popup controller
	_initialize();
	return pub;
};

// Initialize popup controller when DOM is ready
document.addEventListener("DOMContentLoaded", function() {
	cls_redditShieldPopup({});
});
