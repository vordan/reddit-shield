/*
 * RedditShield Content Script
 *
 * This module runs on Reddit pages and performs real-time content filtering based
 * on user-defined criteria. It handles both old Reddit (old.reddit.com) and new
 * Reddit designs by detecting DOM structure differences and applying appropriate
 * filtering methods.
 *
 * Filtering process:
 * 1. Loads filter criteria from Chrome storage (sync or local based on user preference)
 * 2. Processes and cleans input data (removes prefixes, normalizes case)
 * 3. Observes DOM changes using MutationObserver for dynamic content
 * 4. Applies filtering by setting display:none on matching elements
 * 5. Filters posts on listing pages and comments on thread pages
 *
 * Performance considerations:
 * - Only processes visible elements to avoid O(n^2) complexity
 * - Uses Set data structures for O(1) lookup performance
 * - Debounced through MutationObserver to handle rapid DOM changes
 *
 * Thread cleanup feature:
 * - Collects all visible user names from current thread
 * - Excludes already-filtered users to avoid duplicates
 * - Sends list back to popup for addition to filter list
 * - Immediately applies filtering to collected users
 *
 * Storage integration:
 * - Automatically detects sync preference from local storage
 * - Reloads and reapplies filters when storage changes
 * - Supports migration between storage types
 *
 * @version 1.51
 * @author Vanco Ordanoski <vordan@infoproject.biz>
 * @date 2025-10-08
 */
const cls_redditShieldContent = function(_options) {
	// Global variables for content filtering
	let __user_bans = new Set();
	let __subreddit_bans = new Set();
	let __keyword_bans = new Set();
	let __domain_bans = new Set();
	let __logging_enabled = false;
	let __filter_users = false;
	let __filter_keywords = false;
	let __filter_subreddits = false;
	let __filter_domains = false;
	let __filtered_count = 0; // Track total filtered items for badge
	let __current_url = window.location.href; // Track current URL for navigation detection

	// Console log styling
	const __log_styles = {
		subreddit: 'color: #FF6B6B; font-weight: bold; background: #FFE5E5; padding: 2px 6px; border-radius: 3px;',
		keyword: 'color: #4ECDC4; font-weight: bold; background: #E5F9F7; padding: 2px 6px; border-radius: 3px;',
		user: 'color: #95E1D3; font-weight: bold; background: #E5F9F4; padding: 2px 6px; border-radius: 3px;',
		domain: 'color: #F38181; font-weight: bold; background: #FFE5E5; padding: 2px 6px; border-radius: 3px;',
		cleanup: 'color: #AA96DA; font-weight: bold; background: #F0EBFF; padding: 2px 6px; border-radius: 3px;',
		title: 'color: #666; font-style: italic;'
	};

	// Initialize the content script
	function _initialize() {
		// Listen for messages from popup (cleanup requests)
		chrome.runtime.onMessage.addListener(_cleanup_request_handle);
		// Load saved filtering options
		_options_get_saved();
		// Start observing DOM changes for dynamic content
		_dom_changes_observe();
	}

	// Filter posts based on filtering criteria
	function _posts_ban(_subreddits, _keywords, _users, _domains) {
		// Don't filter posts on individual thread pages
		if (window.location.pathname.includes("/comments/")) {
			return;
		}

		// Get all post elements in Reddit
		const _posts = document.querySelectorAll("shreddit-post");
		// Filter to only visible posts to avoid O(n^2) complexity
		const _visible_posts = Array.from(_posts).filter(
			(_el) => window.getComputedStyle(_el).display !== "none"
		);

		_visible_posts.forEach((_post) => {
			// Extract post metadata (slice(2) removes "r/" prefix)
			const _subreddit = _post.getAttribute("subreddit-prefixed-name").slice(2);
			const _title = _post.getAttribute("post-title");
			const _author = _post.getAttribute("author");
			const _domain = _post.getAttribute("domain");

			// Filter by subreddit
			if (__filter_subreddits && _subreddits.has(_subreddit.toLowerCase())) {
				if (__logging_enabled) {
					console.log(
						`%c🛡️ SUBREDDIT %c${_subreddit}%c → %c${_title}`,
						'color: #FF6B6B; font-weight: bold;',
						__log_styles.subreddit,
						'color: #999;',
						__log_styles.title
					);
				}
				_post.style.display = "none";
				__filtered_count++;
				return;
			}

			// Filter by keywords in title
			const _lower_title = _title.toLowerCase();
			if (__filter_keywords) {
				for (let _ban_word of _keywords) {
					if (_lower_title.includes(_ban_word)) {
						if (__logging_enabled) {
							console.log(
								`%c🛡️ KEYWORD %c${_ban_word}%c → %c${_title}`,
								'color: #4ECDC4; font-weight: bold;',
								__log_styles.keyword,
								'color: #999;',
								__log_styles.title
							);
						}
						_post.style.display = "none";
						__filtered_count++;
						return;
					}
				}
			}

			// Filter by user/author
			if (__filter_users && _users.has(_author)) {
				if (__logging_enabled) {
					console.log(
						`%c🛡️ USER %c${_author}%c → %c${_title}`,
						'color: #95E1D3; font-weight: bold;',
						__log_styles.user,
						'color: #999;',
						__log_styles.title
					);
				}
				_post.style.display = "none";
				__filtered_count++;
				return;
			}

			// Filter by domain
			if (__filter_domains && _domains.has(_domain.toLowerCase())) {
				if (__logging_enabled) {
					console.log(
						`%c🛡️ DOMAIN %c${_domain}%c → %c${_title}`,
						'color: #F38181; font-weight: bold;',
						__log_styles.domain,
						'color: #999;',
						__log_styles.title
					);
				}
				_post.style.display = "none";
				__filtered_count++;
				return;
			}
		});
	}

	// Filter comments based on user filtering
	function _comments_ban(_users = []) {
		// Only filter comments on thread pages
		if (!window.location.pathname.includes("/comments/")) {
			return;
		}

		// Only process if user filtering is enabled
		if (!__filter_users) {
			return;
		}

		// Get all comment elements in Reddit
		const _comments = document.querySelectorAll("shreddit-comment");
		// Filter to only visible comments to avoid O(n^2) complexity
		const _visible_comments = Array.from(_comments).filter(
			(_el) => window.getComputedStyle(_el).display !== "none"
		);

		_visible_comments.forEach((_comment) => {
			// Extract comment author
			const _author = _comment.getAttribute("author");
			if (_author && _users.has(_author)) {
				if (__logging_enabled) {
					console.log(
						`%c🛡️ USER %c${_author}%c → comment hidden`,
						'color: #95E1D3; font-weight: bold;',
						__log_styles.user,
						'color: #999;'
					);
				}
				_comment.style.display = "none";
				__filtered_count++;
			}
		});
	}

	// Update badge with current filtered count
	function _badge_update() {
		chrome.runtime.sendMessage({
			action: 'updateBadge',
			count: __filtered_count
		}).catch(function(_error) {
			// Silently handle errors (e.g., when background script is reloading)
		});
	}

	// Get saved filtering options from storage
	function _options_get_saved() {
		// First check sync preference from local storage
		chrome.storage.local.get(["enableSync"], function(_local_result) {
			const _enable_sync = _local_result.enableSync !== undefined ? _local_result.enableSync : true;
			// Determine which storage area to use
			const _storage_area = _enable_sync ? chrome.storage.sync : chrome.storage.local;

			// Get all filtering options from storage
			_storage_area.get([
				"hiddenUsers", "hiddenKeywords", "hiddenSubreddits", "hiddenDomains",
				"loggingEnabled", "filterUsers", "filterKeywords", "filterSubreddits", "filterDomains",
				"blockUsers", "blockKeywords", "blockSubreddits", "blockDomains"  // backward compatibility
			], function(_result) {
				_options_process(_result);
			});
		});
	}

	// Process and apply filtering options
	function _options_process(_result) {
		// Clear existing filter sets
		__user_bans.clear();
		__keyword_bans.clear();
		__subreddit_bans.clear();
		__domain_bans.clear();

		// Process hidden users list
		if (_result.hiddenUsers) {
			for (let _user of _result.hiddenUsers) {
				// Clean user input (remove "u/" prefix if present)
				let _cleaned_user = _user;
				if (_cleaned_user.length >= 2 && _user.substring(0, 2) == "u/") {
					_cleaned_user = _user.slice(2);
				}
				__user_bans.add(_cleaned_user);
			}
		}

		// Process hidden keywords list
		if (_result.hiddenKeywords) {
			for (let _keyword of _result.hiddenKeywords) {
				// Only add non-empty keywords
				if (_keyword.trim() != "") {
					__keyword_bans.add(_keyword.toLowerCase());
				}
			}
		}

		// Process hidden subreddits list
		if (_result.hiddenSubreddits) {
			for (let _subreddit of _result.hiddenSubreddits) {
				// Clean subreddit input (remove "r/" prefix if present)
				let _cleaned_subreddit = _subreddit;
				if (_subreddit.length >= 2 && _subreddit.substring(0, 2) == "r/") {
					_cleaned_subreddit = _subreddit.slice(2);
				}
				__subreddit_bans.add(_cleaned_subreddit.toLowerCase());
			}
		}

		// Process hidden domains list
		if (_result.hiddenDomains) {
			for (let _domain of _result.hiddenDomains) {
				// Extract domain from URL using regex
				const _pattern = /^(?:https?:\/\/)?(?:www\.)?([^\/\?#]+).*$/i;
				const _match = _domain.replace(_pattern, "$1") || "";
				__domain_bans.add(_match.toLowerCase());
			}
		}

		// Set preference flags from storage (with backward compatibility)
		if (_result.loggingEnabled !== undefined) {
			__logging_enabled = _result.loggingEnabled;
		}
		if (_result.filterUsers !== undefined) {
			__filter_users = _result.filterUsers;
		} else if (_result.blockUsers !== undefined) {
			__filter_users = _result.blockUsers;  // backward compatibility
		}
		if (_result.filterKeywords !== undefined) {
			__filter_keywords = _result.filterKeywords;
		} else if (_result.blockKeywords !== undefined) {
			__filter_keywords = _result.blockKeywords;  // backward compatibility
		}
		if (_result.filterSubreddits !== undefined) {
			__filter_subreddits = _result.filterSubreddits;
		} else if (_result.blockSubreddits !== undefined) {
			__filter_subreddits = _result.blockSubreddits;  // backward compatibility
		}
		if (_result.filterDomains !== undefined) {
			__filter_domains = _result.filterDomains;
		} else if (_result.blockDomains !== undefined) {
			__filter_domains = _result.blockDomains;  // backward compatibility
		}

		// Check if URL has changed (navigation)
		if (window.location.href !== __current_url) {
			// Page navigation detected - reset counter
			__filtered_count = 0;
			__current_url = window.location.href;
		}

		// Apply the filtering with current settings
		_posts_ban(__subreddit_bans, __keyword_bans, __user_bans, __domain_bans);
		_comments_ban(__user_bans);

		// Update badge with new count
		_badge_update();
	}

	// Observe DOM changes for dynamic content loading
	function _dom_changes_observe() {
		let _debounce_timeout = null;

		// Create mutation observer to watch for new content
		const _observer = new MutationObserver(function(_mutations) {
			// Check if any new nodes were added to the DOM
			if (_mutations.some((_mutation) => _mutation.addedNodes.length)) {
				// Clear existing timeout
				if (_debounce_timeout) {
					clearTimeout(_debounce_timeout);
				}

				// Debounce the processing to avoid rapid successive calls
				_debounce_timeout = setTimeout(() => {
					// Reload options and reapply filtering when new content appears
					_options_get_saved();
				}, 100); // 100ms debounce
			}
		});

		// Configure observer to watch for child additions in entire document
		const _config = { childList: true, subtree: true };
		_observer.observe(document.body, _config);
	}

	// Handle cleanup requests from popup
	function _cleanup_request_handle(_request, _sender, _send_response) {
		// Process users cleanup requests (filter thread)
		if (_request.action === "cleanupUsers") {
			// Only allow cleanup on thread pages
			if (!window.location.pathname.includes("/comments/")) {
				_send_response({ status: 400, message: "Can only cleanup threads" });
			} else {
				if (__logging_enabled) {
					console.log(
						`%c🧹 CLEANUP %cThread cleanup initiated`,
						'color: #AA96DA; font-weight: bold;',
						__log_styles.cleanup
					);
				}

				// Collect all users in the current thread
				let _users_to_ban = [];
				_users_to_ban = _cleanup_get_users();

				if (__logging_enabled) {
					console.log(
						`%c🧹 CLEANUP %cFound ${_users_to_ban.length} users to filter`,
						'color: #AA96DA; font-weight: bold;',
						__log_styles.cleanup
					);
				}

				// Send collected users back to popup
				_send_response({ status: 200, message: _users_to_ban });
				// Immediately hide comments from collected users
				_comments_ban(new Set(_users_to_ban));
			}
		}

		// Process keywords cleanup requests (remove from current page)
		if (_request.action === "cleanupKeywords") {
			if (__logging_enabled) {
				console.log(
					`%c🧹 CLEANUP %cKeywords cleanup initiated`,
					'color: #AA96DA; font-weight: bold;',
					__log_styles.cleanup
				);
			}

			// Collect all keywords from current page
			const _found_keywords = _cleanup_get_keywords();

			if (__logging_enabled) {
				console.log(
					`%c🧹 CLEANUP %cFound ${_found_keywords.length} keywords on page`,
					'color: #AA96DA; font-weight: bold;',
					__log_styles.cleanup
				);
			}

			// Send collected keywords back to popup
			_send_response({ status: 200, message: _found_keywords });
		}

		// Process subreddits cleanup requests (remove from current page)
		if (_request.action === "cleanupSubreddits") {
			if (__logging_enabled) {
				console.log(
					`%c🧹 CLEANUP %cSubreddits cleanup initiated`,
					'color: #AA96DA; font-weight: bold;',
					__log_styles.cleanup
				);
			}

			// Collect all subreddits from current page
			const _found_subreddits = _cleanup_get_subreddits();

			if (__logging_enabled) {
				console.log(
					`%c🧹 CLEANUP %cFound ${_found_subreddits.length} subreddits on page`,
					'color: #AA96DA; font-weight: bold;',
					__log_styles.cleanup
				);
			}

			// Send collected subreddits back to popup
			_send_response({ status: 200, message: _found_subreddits });
		}
	}

	// Get all users from thread for filtering
	function _cleanup_get_users() {
		// Select all posts and comments in Reddit
		const _posts_and_comments = document.querySelectorAll("shreddit-post, shreddit-comment");

		// Collect all unique authors not already filtered
		return Array.from(_posts_and_comments).reduce((_accumulated_bans, _comment) => {
			const _author = _comment.getAttribute("author");
			// Only add authors that aren't already in the filter list
			if (_author && !__user_bans.has(_author)) {
				_accumulated_bans.push(_author);
			}
			return _accumulated_bans;
		}, []);
	}

	// Get all keywords from current page titles
	function _cleanup_get_keywords() {
		// Get all post elements in Reddit
		const _posts = document.querySelectorAll("shreddit-post");
		const _found_keywords = new Set();

		// Iterate through filtered keywords to see which appear on the page
		__keyword_bans.forEach((_keyword) => {
			Array.from(_posts).forEach((_post) => {
				const _title = _post.getAttribute("post-title");
				if (_title && _title.toLowerCase().includes(_keyword.toLowerCase())) {
					_found_keywords.add(_keyword.toLowerCase());
				}
			});
		});

		return Array.from(_found_keywords);
	}

	// Get all subreddits from current page
	function _cleanup_get_subreddits() {
		// Get all post elements in Reddit
		const _posts = document.querySelectorAll("shreddit-post");
		const _found_subreddits = new Set();

		// Iterate through filtered subreddits to see which appear on the page
		__subreddit_bans.forEach((_subreddit) => {
			Array.from(_posts).forEach((_post) => {
				const _subreddit_full = _post.getAttribute("subreddit-prefixed-name");
				if (_subreddit_full) {
					const _subreddit_name = _subreddit_full.slice(2).toLowerCase();
					if (_subreddit_name === _subreddit.toLowerCase()) {
						_found_subreddits.add(_subreddit.toLowerCase());
					}
				}
			});
		});

		return Array.from(_found_subreddits);
	}

	// Public object for future extensibility
	var pub = {
		// Public methods can be added here in the future
	};

	// Initialize the content script
	_initialize();
	return pub;
};

// Initialize content script when page loads
cls_redditShieldContent({});
