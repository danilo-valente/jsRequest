(function (window, waitForBody) {
	'use strict';
	
	var doc = window.document;
	var isModule = typeof (module) === 'object' && !!module && typeof (module.exports) === 'object';
	
	/*
	 * XMLHttpRequest compatibility
	 */
	var newXhr = (function () {
		if (!!window.XMLHttpRequest) {
			return function () {
				return new window.XMLHttpRequest();
			};
		}
		if (!!window.activeXObject) {
			return function () {
				return new window.ActiveXObject('Microsoft.XMLHTTP');
			};
		}
		return function () {
			return null;
		};
	})();
	
	/*
	 * jsRequest
	 */
	var tasks = [];
	var callbacks = {};
	var pageCallbacks = [];	// Called when the page is loaded (see function change in the bottom)
	var lastAdded = null;
	var history = [];
	var files = {};
	
	var isFn = function (fn) {
		return fn instanceof Function;
	};
	
	var attachEvent = function (target, event, action) {
		event = 'on' + event;
		target[event] = !isFn(target[event]) ? action : function () {
			try {
				target[event].apply(this, arguments);
			} catch (ex) {
				console.error(ex.stack);
			}
			action.apply(this, arguments);
		};
	};
	
	var addEvent = (function () {
		if (!!window.addEventListener) {
			return function (target, event, action) {
				if (!target) {
					return null;
				}
				return target.addEventListener ? target.addEventListener(event, action, false) : attachEvent(target, event, action);
			};
		}
		if (window.attachEvent) {
			return function (target, event, action) {
				if (!target) {
					return null;
				}
				return target.attachEvent ? target.attachEvent('on' + event, action, false) : attachEvent(target, event, action);
			};
		}
		return attachEvent;
	})();
	
	var isReady = (function () {
		if(isModule) {
			return function () {
				return true;
			};
		}
		if(!!waitForBody) {
			return function () {
				return doc.readyState === 'complete' && doc.body !== null;
			};
		}
		return function () {
			return doc.readyState === 'complete';
		};
	})();
	
	var scheduleTask = function (task) {
		if (isReady()) {
			task.call();
		} else {
			tasks.push(task);
		}
	};
	
	var runCallbacks = function (callbacks, scope, args) {
		while (callbacks.length > 0) {
			try {
				callbacks.shift().apply(scope, args);
			} catch (ex) {
				console.error(ex.stack);
			}
		}
	};
	
	var runScript = function (code) {
		var script = doc.createElement('script');
		script.setAttribute('type', 'text/javascript');
		script.text = code;
		doc.getElementsByTagName('head')[0].appendChild(script);
	};
	
	var parseURL = function (url) {
		if (typeof (url) !== 'string') {
			url = '';
		}
		var a = doc.createElement('a');
		a.href = url;
		var pieces = {
			hash	: a.hash,
			host	: a.host,
			hostname: a.hostname,
			origin	: a.origin,
			pathname: a.pathname,
			port	: a.port,
			protocol: a.protocol,
			query	: a.query
		};
		var l = window.location;
		return {
			hash	: !pieces.hash		? l.hash		: pieces.hash,
			host	: !pieces.host		? l.host		: pieces.host,
			hostname: !pieces.hostname	? l.hostname	: pieces.hostname,
			origin	: !pieces.origin	? l.origin		: pieces.origin,
			pathname: !pieces.pathname	? l.pathname	: pieces.pathname,
			port	: !pieces.port		? l.port		: pieces.port,
			protocol: !pieces.protocol	? l.protocol	: pieces.protocol,
			query	: !pieces.query		? l.query		: pieces.query
		};
	};
	
	var jsRequest;
	
	/*
	 * Loads the script from a script tag
	 */
	var scriptTagTask = function (url, options) {
		return function () {
			var startDate = new Date().getTime();
			var script = doc.createElement('script');
			script.setAttribute('type', 'text/javascript');
			script.setAttribute('src', url);
			script.setAttribute('async', true);
			var info = {
				url: url,
				startDate: startDate,
				state: 'failure',
				size: 0
			};
			/*
			 * User-defined events
			 */
			var success = function (e) {
				/*
				 * Progress
				 */
				try {
					options.progress.apply(jsRequest, [url, 100, null, 'ajax', e]);
				} catch (ex) {
					console.error(ex.stack);
				}
				/*
				 * Success
				 */
				info.state = 'success';
				info.endDate = new Date().getTime();
				history.push(info);
				files[url] = info;
				var args = [url, null, 'scripttag', e];
				runCallbacks(callbacks[url], jsRequest);
				try {
					options.success.apply(jsRequest, args);
				} catch (ex) {
					console.error(ex.stack);
				}
			};
			var failure = function (e) {
				/*
				 * Failure
				 */
				info.state = 'failure';
				info.endDate = new Date().getTime();
				history.push(info);
				files[url] = info;
				var args = [url, null, 'scripttag', e];
				try {
					options.failure.apply(jsRequest, args);
				} catch (ex) {
					console.error(ex.stack);
				}
			};
			var hasOnloadEvent = navigator.appName !== 'Microsoft Internet Explorer' || !!window.addEventListener;
			if (hasOnloadEvent) {
				/*
				 * For good browsers only
				 */
				addEvent(script, 'load', success);
				addEvent(script, 'error', failure);
			} else {
				/*
				 * For bad browsers like IE <9 - Doesn't support 'onerror' event
				 */
				var fired = false;
				addEvent(script, 'readystatechange', function (e) {
					if (!fired && (script.readyState === 'loaded' || script.readyState === 'complete')) {
						fired = true;
						success.call(script, e);
					}
				});
			}
			doc.getElementsByTagName('head')[0].appendChild(script);
		};
	};
	
	/*
	 * Loads the JavaScript file from an AJAX call
	 */
	var ajaxTask = function (url, options) {
		var xhr = newXhr();
		if (xhr === null) {
			return scriptTagTask(url, options);
		}
		return function () {
			var startDate = new Date().getTime();
			xhr.open('GET', url);
			xhr.setRequestHeader('Content-Type', 'text/javascript; charset=utf-8');
			if (!!xhr.overrideMimeType) {
				xhr.overrideMimeType('text/javascript; charset=utf-8');
			}
			/*
			 * User-defined events
			 */
			var total = 0;
			addEvent(xhr, 'readystatechange', function (e) {
				if (xhr.readyState === 2) {
					total = parseInt(xhr.getResponseHeader('Content-Length') || '0');
				} else if (xhr.readyState === 3) {
					/*
					 * Progress
					 */
					try {
						options.progress.apply(jsRequest, [url, 100 * xhr.response.length / total, xhr, 'ajax', e]);
					} catch (ex) {
						console.error(ex.stack);
					}
				} else if (this.readyState === 4) {
					var success = (this.status >= 200 && this.status < 300) || this.status === 304;
					var info = {
						url: url,
						startDate: startDate,
						endDate: new Date().getTime(),
						state: success ? 'success' : 'failure',
						size: total
					};
					history.push(info);
					files[url] = info;
					var args = [url, xhr, 'ajax', e];
					if (success) {
						/*
						 * Success
						 */
						runScript(this.response || this.responseText);
						runCallbacks(callbacks[url], jsRequest);
						try {
							options.success.apply(jsRequest, args);
						} catch (ex) {
							console.error(ex.stack);
						}
					} else {
						/*
						 * Failure
						 */
						try {
							options.failure.apply(jsRequest, args);
						} catch (ex) {
							console.error(ex.stack);
						}
					}
				}
			});
			xhr.send();
		};
	};
	
	/*
	 * Validates options. If the second argument is an function, it's interpreted as
	 * the 'success' function. Thus when we receive something like this:
	 * 	jsRequest.load('path/to/file.js',function(){
	 * 		console.log('success');
	 * 	});
	 * We assume the user meant something like this:
	 * 	jsRequest.load('path/to/file.js',{
	 * 		success: function(){
	 * 			console.log('success');
	 * 		}
	 * 	});
	*/
	var normOptions = function (options) {
		if (isFn(options)) {
			return {
				success: options,
				failure: function(){},
				progress: function(){}
			}
		}
		options = options || {};
		return {
			success: isFn(options.success) ? options.success : function () {},
			failure: isFn(options.failure) ? options.failure : function () {},
			progress: isFn(options.progress) ? options.progress : function () {}
		};
	};
	
	/*
	 * The jsRequest object
	 */
	jsRequest = {
		/*
		 * An array containing information about each loaded file, sorted by time
		 */
		history: history,
		/*
		 * An associative array containing information about each loaded file
		 */
		files: files,
		/*
		 * Load's a JavaScript file in two different ways:
		 * <ul>
		 * <li>Inserts a script tag that receives the file's url as value of the "src" parameter
		 * if the requested file is in another server or the current page is running under
		 * the "file://" protocol</li>
		 * <li>Makes an Ajax call and executes the returned content as JavaScript script if the
		 * requested file is stored in the same server of the current page</li>.
		 *
		 * The first argument is always a string containing the url of the requested file. However,
		 * the second one can be both an object that contains a set of options or a function called
		 * as callback of the "success" state.
		 *
		 * The options argument is described below:
		 * {
		 *     success: function(string url, XMLHttpRequest xhr, string method, XMLHttpRequestProgressEvent event),
		 *     failure: function(string url, XMLHttpRequest xhr, string method, XMLHttpRequestProgressEvent event),
		 *     progress: function(string url, XMLHttpRequest xhr, string method, XMLHttpRequestProgressEvent event)
		 * }
		 */
		load: function () {
			var argc = arguments.length;
			var options = normOptions(argc>1 && typeof (argc - 1) !== 'string' ? arguments[--argc] : null);
			for (var i = 0; i < argc; i++) {
				var url = arguments[i];
				lastAdded = url;
				if (!callbacks[url]) {
					callbacks[url] = [];
				}
				if (typeof (url) === 'string') {
					scheduleTask(window.location.protocol === 'file:' || window.location.hostname !== parseURL(url).hostname
						? scriptTagTask(url, options)
						: ajaxTask(url, options)
					);
				}
			}
			return jsRequest;
		},
		/*
		 * Executes a callback function right after the last requested file is loaded.
		 * If the provided action is actually a string, then we assume it's an url and
		 * the user wants to load it. So, <pre>jsRequest.wait("foo/bar.js");</pre> is
		 * exactly the same of <pre>jsRequest.wait(function(){ jsRequest.load("foo/bar.js"); });</pre>.
		 * Also, in this case we consider that the user may have also provided a second
		 * argument, which is passed to jsRequest.load as the options argument.
		 * There is also a third function overload, which takes two arguments, the file's
		 * url and a function, which is considered as the callback in case of success.
		 * Thus, <pre>jsRequest.load("foo/bar.js", function(){});</pre> is the same of
		 * jsRequest.load("foo/bar.js", {success: function(){}});</pre>.
		 */
		wait: function (action) {
			/*
			 * Issue #1:
			 * - Bug: Changing the original reference of 'action' also changes the original
			 *     reference of 'arguments[0]' in the non-strict mode. Thus, 'arguments[0]'
			 *     would be a function rather than a string
			 * - Solution: Created a var called '_action' instead of changing the original
			 *     reference of 'action'
			 */
			var _action = action;
			if (typeof (_action) === 'string') {
				var args = arguments;
				_action = function () {
					jsRequest.load.apply(this, args);
				}
			}
			if (!isFn(_action)) {
				_action = function () {};
			}
			var target = lastAdded;
			if (target === null) {
				if (isReady()) {
					runCallbacks([_action], jsRequest);
				} else {
					pageCallbacks.push(_action);
				}
			} else {
				callbacks[target].push(_action);
			}
			return jsRequest;
		}
	};
	
	/*
	 * Called once the page is loaded
	 */
	var init = function () {
		runCallbacks(pageCallbacks, jsRequest);
		while (tasks.length > 0) {
			tasks.shift().call();
		}
	};
	
	/*
	 * Expose
	 */
	if (isModule) {
		module.exports = jsRequest;
		init();
	} else {
		window.jsRequest = jsRequest;
		/*
		 * Wait for page loading
		 */
		var isPageLoaded = false;
		var change = function () {
			if (isReady() && !isPageLoaded) {
				isPageLoaded = true;
				init();
			}
		};
		addEvent(window, 'load', change);
		addEvent(doc, 'load', change);
		addEvent(doc, 'readystatechange', change);
		change();	// If the page is already loaded, the events above won't be fired
	}
})(window, true);
