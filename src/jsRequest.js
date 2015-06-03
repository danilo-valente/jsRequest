(function (window, factory) {
    'use strict';

    var jsRequest = factory(window, window.document, window.location, function () {});

    if (typeof (module) === 'object' && module.exports) {
        module.exports = jsRequest;
    } else {
        window.jsRequest = jsRequest;
    }

})(window, function (window, document, location, noop) {
    'use strict';

    var head = null;
    var isLocal = location.protocol === 'file:';

    var newXhr = (function () {
        if (window.XMLHttpRequest) {
            return function () {
                return new window.XMLHttpRequest;
            };
        }
        if (window.ActiveXObject) {
            return function () {
                return new window.ActiveXObject('Microsoft.XMLHTTP');
            };
        }
        return null;
    })();

    var addEvent = (function () {
        if (window.addEventListener) {
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

    var $tasks = [];
    var $pageCallbacks = [];    // Called when the page is loaded (see function `change` in the bottom)
    var $lastAdded = null;
    var $history = [];          // An array containing information about each loaded file, sorted by time
    var $files = {};			// A map containing information about each loaded file
    var $handlers = {};         // A map containing all handlers of each url

    // Wait for page loading
    var isPageLoaded = false;
    addEvent(window, 'load', change);
    addEvent(document, 'load', change);
    addEvent(document, 'readystatechange', change);
    change();	// If the page is already loaded, the events above won't be fired

    /**
     * The jsRequest object
     * @type {{version: string, history: Array, files: {}, load: load, wait: wait}}
     */
    var jsRequest = {
        version: '<%= version %>',
        history: $history,
        files: $files,
        load: load,
        wait: wait
    };

    /**
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
    function load() {
        var argc = arguments.length;
        var handlers = getHandlers(argc >= 1 && typeof arguments[argc - 1] !== 'string' ? arguments[--argc] : null);

        for (var i = 0; i < argc; i++) {
            var url = anchor(arguments[i]).href;
            $lastAdded = url;

            if (!$handlers[url]) {
                $handlers[url] = [];
            }
            $handlers[url].push(handlers);

            var cachedFile = $files[url];
            if (cachedFile && cachedFile.state !== 'failure') {
                if (cachedFile.state === 'success') {
                    scheduleTask(cacheTask(url));
                }
            } else if (typeof (url) === 'string') {
                scheduleTask(isLocal || anchor(url).hostname !== location.hostname || !newXhr
                        ? scriptTagTask(url)
                        : ajaxTask(url)
                );
            }
        }

        return jsRequest;
    }

    /**
     * Executes a callback function right after the last requested file is loaded.
     * If the provided action is actually a string, then we assume it's an url and
     * the user wants to load it. So, <pre>jsRequest.wait("foo/bar.js");</pre> is
     * exactly the same of <pre>jsRequest.wait(function(){ jsRequest.load("foo/bar.js"); });</pre>.
     * Also, in this case we consider that the user may have also provided a second
     * argument, which is passed to jsRequest.load as the options argument.
     * There is also a third function overload, which takes two arguments, the file's
     * url and a function, which is considered as the callback in case of success.
     * Thus, <pre>jsRequest.load("foo/bar.js", function () {});</pre> is the same of
     * jsRequest.load("foo/bar.js", {success: function () {}});</pre>.
     */
    function wait(action) {
        /*
         * Issue #1:
         * - Bug: Changing the original reference of 'action' also changes the original
         *     reference of 'arguments[0]' in the non-strict mode. Thus, 'arguments[0]'
         *     would be a function rather than a string
         * - Solution: Created a var called 'fn' instead of changing the original
         *     reference of 'action'
         */
        var fn = action;
        if (typeof fn === 'string') {
            var args = arguments;
            fn = function () {
                jsRequest.load.apply(this, args);
            };
        } else if (!isFunction(fn)) {
            fn = noop;
        }

        if (!$lastAdded) {
            if (isReady()) {
                run(fn);
            } else {
                $pageCallbacks.push(fn);
            }
        } else {
            $handlers[$lastAdded].push({ success: fn });
        }

        return jsRequest;
    }

    function change() {
        if (!isPageLoaded && isReady()) {
            isPageLoaded = true;
            init();
        }
    }

    /**
     * Called once the page is loaded
     */
    function init() {
        head = document.head || document.getElementsByTagName('head')[0];
        while ($pageCallbacks.length > 0) {
            run($pageCallbacks.shift());
        }
        while ($tasks.length > 0) {
            $tasks.shift().call();
        }
    }

    /**
     * Loads the script from a script tag
     * @param {string} url
     * @returns {Function}
     */
    function scriptTagTask(url) {
        return function () {

            var info = {
                url: url,
                startDate: new Date().getTime(),
                endDate: null,
                state: 'loading',
                size: 0
            };
            $files[url] = info;

            var script = scriptTag(url);

            var onloadSupported = navigator.appName !== 'Microsoft Internet Explorer' || window.addEventListener;
            if (onloadSupported) {
                // For good browsers only
                addEvent(script, 'load', success);
                addEvent(script, 'error', failure);
            } else {
                // For bad browsers like IE <9 - Doesn't support 'onerror' event
                var fired = false;
                addEvent(script, 'readystatechange', function (e) {
                    if (!fired && (script.readyState === 'loaded' || script.readyState === 'complete')) {
                        fired = true;
                        success.call(script, e);
                    }
                });
            }
            head.appendChild(script);

            function success(e) {
                // Progress
                callHandlers(url, 'progress', [url, 100, null, 'scripttag', e]);

                // Success
                info.state = 'success';
                info.endDate = new Date().getTime();
                $history.push(info);
                $files[url] = info;

                callHandlers(url, 'success', [url, null, 'scripttag', e]);
                $handlers[url] = [];    // Wipe all handlers
            }

            function failure(e) {
                info.state = 'failure';
                info.endDate = new Date().getTime();
                $history.push(info);
                $files[url] = info;

                callHandlers(url, 'failure', [url, null, 'scripttag', e]);
                $handlers[url] = [];    // Wipe all handlers
            }
        };
    }

    /**
     * Create a new script element
     * @param url
     * @returns {Element}
     */
    function scriptTag(url) {
        var script = document.createElement('script');
        script.setAttribute('type', 'text/javascript');
        script.setAttribute('src', url);
        script.setAttribute('async', 'true');
        return script;
    }

    /**
     * Loads the JavaScript file from an AJAX call
     * @param {string} url
     * @returns {Function}
     */
    function ajaxTask(url) {
        return function () {

            var info = {
                url: url,
                startDate: new Date().getTime(),
                endDate: null,
                state: 'loading',
                size: 0
            };
            $files[url] = info;

            var xhr = newXhr();
            xhr.open('GET', url);
            xhr.setRequestHeader('Content-Type', 'text/javascript; charset=utf-8');
            if (xhr.overrideMimeType) {
                xhr.overrideMimeType('text/javascript; charset=utf-8');
            }

            var total = 0;
            addEvent(xhr, 'readystatechange', function (e) {
                switch (xhr.readyState) {
                    case 2:
                        total = parseInt(xhr.getResponseHeader('Content-Length') || 0);
                        break;

                    case 3:
                        // Progress
                        callHandlers(url, 'progress', [url, 100 * xhr.response.length / total, xhr, 'ajax', e]);
                        break;

                    case 4: {
                        var success = (this.status >= 200 && this.status < 300) || this.status === 304;

                        info.endDate = new Date().getTime();
                        info.state = success ? 'success' : 'failure';
                        info.size = total;
                        $history.push(info);
                        $files[url] = info;

                        var args = [url, xhr, 'ajax', e];
                        if (success) {
                            evalScript(this.response || this.responseText);
                            callHandlers(url, 'success', args);
                        } else {
                            callHandlers(url, 'failure', args);
                        }

                        // Wipe all handlers
                        $handlers[url] = [];
                        break;
                    }
                }
            });
            xhr.send();
        };
    }

    /**
     * Loads the script from cache
     * @param url
     * @param options
     * @returns {Function}
     */
    function cacheTask(url) {
        return function () {
            // Progress
            callHandlers(url, 'progress', [url, 100, null, 'cache', null]);

            var cachedFile = $files[url];
            $history.push({
                url: url,
                startDate: cachedFile.startDate,
                endDate: cachedFile.endDate,
                state: 'cached',
                size: cachedFile.size
            });

            // Success
            callHandlers(url, 'success', [url, null, 'cache', null]);
            $handlers[url] = [];    // Wipe all handlers
        };
    }

    /**
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
     *
     * @param handlers
     * @returns {*}
     */
    function getHandlers(handlers) {
        if (isFunction(handlers)) {
            return {
                success: handlers,
                failure: noop,
                progress: noop
            };
        }

        handlers = handlers || {};
        return {
            success: isFunction(handlers.success) ? handlers.success : noop,
            failure: isFunction(handlers.failure) ? handlers.failure : noop,
            progress: isFunction(handlers.progress) ? handlers.progress : noop
        };
    }

    function isFunction(fn) {
        return fn instanceof Function;
    }

    function isReady() {
        return document.readyState === 'complete';
    }

    function attachEvent(target, event, action) {
        event = 'on' + event;
        target[event] = !isFunction(target[event]) ? action : function () {
            run(target[event], arguments, this);
            action.apply(this, arguments);
        };
    }

    function scheduleTask(task) {
        if (isReady()) {
            task.call();
        } else {
            $tasks.push(task);
        }
    }

    /**
     * Evaluate JavaScript code
     * @param code
     */
    function evalScript(code) {
        var script = document.createElement('script');
        script.setAttribute('type', 'text/javascript');
        script.text = code;
        head.appendChild(script);
    }

    /**
     * Create a new HTMLAnchorElement pointing to a given url
     * @param {string} url
     * @returns {HTMLAnchorElement}
     */
    function anchor(url) {
        var a = /** @type HTMLAnchorElement */ document.createElement('a');
        a.href = url;
        return a;
    }

    /**
     * Call all handlers for a given url
     * @param url
     * @param type
     * @param args
     */
    function callHandlers(url, type, args) {
        var handlers = $handlers[url];
        var i, len = handlers.length;
        for (i = 0; i < len; i++) {
            run(handlers[i][type], args);
        }
    }

    /**
     * Safely run a function
     * @param fn
     * @param {(Object[]|Arguments)} [args=[]]
     * @param {Object} [scope=jsRequest]
     * @returns {*}
     */
    function run(fn, args, scope) {
        if (!fn) {
            return;
        }
        try {
            return fn.apply(scope || jsRequest, args || []);
        } catch (err) {
            console.error(err.stack);
        }
    }

    return jsRequest;
});