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

    var tasks = [];
    var callbacks = {};
    var pageCallbacks = [];	// Called when the page is loaded (see function `change` in the bottom)
    var lastAdded = null;
    var history = [];		// An array containing information about each loaded file, sorted by time
    var files = {};			// An associative array containing information about each loaded file

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
        history: history,
        files: files,
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
        var options = normOptions(argc>1 && typeof (argc - 1) !== 'string' ? arguments[--argc] : null);
        for (var i = 0; i < argc; i++) {
            var url = arguments[i];
            lastAdded = url;
            if (!callbacks[url]) {
                callbacks[url] = [];
            }
            if (typeof (url) === 'string') {
                scheduleTask(isLocal || isExternal(url) || !newXhr
                        ? scriptTagTask(url, options)
                        : ajaxTask(url, options)
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
         * - Solution: Created a var called '_action' instead of changing the original
         *     reference of 'action'
         */
        var _action = action;
        if (typeof (_action) === 'string') {
            var args = arguments;
            _action = function () {
                jsRequest.load.apply(this, args);
            };
        }
        if (!isFunction(_action)) {
            _action = noop;
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

    function change() {
        if (!isPageLoaded && isReady()) {
            isPageLoaded = true;
            init();
        }
    }

    /*
     * Called once the page is loaded
     */
    function init() {
        head = document.head || document.getElementsByTagName('head')[0];
        runCallbacks(pageCallbacks, jsRequest);
        while (tasks.length > 0) {
            tasks.shift().call();
        }
    }

    /**
     * Loads the script from a script tag
     * @param url
     * @param options
     * @returns {Function}
     */
    function scriptTagTask(url, options) {
        return function () {
            var startDate = new Date().getTime();
            var script = scriptTag(url);

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
                // Progress
                run(options.progress, [url, 100, null, 'ajax', e]);

                // Success
                info.state = 'success';
                info.endDate = new Date().getTime();
                history.push(info);
                files[url] = info;
                var args = [url, null, 'scripttag', e];
                runCallbacks(callbacks[url], jsRequest);
                run(options.success, args);
            };

            var failure = function (e) {
                info.state = 'failure';
                info.endDate = new Date().getTime();
                history.push(info);
                files[url] = info;
                var args = [url, null, 'scripttag', e];
                run(options.failure, args);
            };

            var hasOnloadEvent = navigator.appName !== 'Microsoft Internet Explorer' || window.addEventListener;
            if (hasOnloadEvent) {
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
     * @param url
     * @param options
     * @returns {Function}
     */
    function ajaxTask(url, options) {
        return function () {
            var xhr = newXhr();
            var startDate = new Date().getTime();
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
                        run(options.progress, [url, 100 * xhr.response.length / total, xhr, 'ajax', e]);
                        break;

                    case 4: {
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
                            // Success
                            runScript(this.response || this.responseText);
                            runCallbacks(callbacks[url], jsRequest);
                            run(options.success, args);
                        } else {
                            // Failure
                            run(options.failure, args);
                        }
                        break;
                    }
                }
            });
            xhr.send();
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
     * @param options
     * @returns {*}
     */
    function normOptions(options) {
        if (isFunction(options)) {
            return {
                success: options,
                failure: noop,
                progress: noop
            };
        }

        options = options || {};
        return {
            success: isFunction(options.success) ? options.success : noop,
            failure: isFunction(options.failure) ? options.failure : noop,
            progress: isFunction(options.progress) ? options.progress : noop
        };
    }

    function isFunction(fn) {
        return fn instanceof Function;
    }

    function isReady() {
        return document.readyState === 'complete' && document.body !== null;
    }

    function attachEvent(target, event, action) {
        event = 'on' + event;
        target[event] = !isFunction(target[event]) ? action : function () {
            try {
                target[event].apply(this, arguments);
            } catch (err) {
                console.error(err.stack);
            }
            action.apply(this, arguments);
        };
    }

    function scheduleTask(task) {
        if (isReady()) {
            task.call();
        } else {
            tasks.push(task);
        }
    }

    function runCallbacks(callbacks, scope, args) {
        while (callbacks.length > 0) {
            try {
                callbacks.shift().apply(scope, args);
            } catch (err) {
                console.error(err.stack);
            }
        }
    }

    function runScript(code) {
        var script = document.createElement('script');
        script.setAttribute('type', 'text/javascript');
        script.text = code;
        head.appendChild(script);
    }

    function isExternal(url) {
        if (typeof url !== 'string') {
            return false;
        }
        var a = document.createElement('a');
        a.href = url;
        return (a.hostname || location.hostname) !== location.hostname;
    }

    function run(fn, args) {
        try {
            return fn.apply(jsRequest, args);
        } catch (err) {
            console.error(err.stack);
        }
    }

    return jsRequest;
});