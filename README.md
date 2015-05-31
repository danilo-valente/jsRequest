[jsRequest](https://github.com/danilo-valente/jsRequest)
===================================================

A JavaScript framework for fast and easy asynchronous JavaScript files loading

Copyright (C) 2015 [Danilo Marcolino Valente](https://github.com/danilo-valente/) and [Bruno Luis Panuto Silva](https://github.com/ThePanuto/)

### Quick Index

 - [About](#about)
   - [The loading process](#the-loading-process)
   - [Callbacks](#callbacks)
 - [Usage & Syntax](#usage--syntax)
   - [The `options` argument](#the-options-argument)
   - [Interactive loading - The `progress` event](#interactive-loading---the-progress-event)
   - [Being pacient - The `.wait` method](#being-pacient---the-wait-method)
 - [Other Features](#other-features)
   - [History](#history)
   - [Files information](#files-information)
 - [Compatibility](#compatibility)
 - [Known bugs](#known-bugs)
 - [Authors](#authors)
 - [License](#license)

- - -

About
=====

jsRequest is a crossbrowser JavaScript framework that allows programmers to include external JavaScript
files in their pages with nothing more than a single line.
Its flexibility and high-compatibility ensures that your files will be loaded even on older browsers.

### The loading process

It uses two methods to load files:

 1. Ajax (XMLHttpRequest): The most rich and reliable method, makes an Ajax `GET` call to the file's
	url and, once it's totally received, appends a new `<script>` tag to the `<head>` and sets the response
	as its content.

 2. `<script>` tag: An alternative for older browsers, files stored outside the current server and files loaded
	via the `file://` protocol, it consists in the tradicional method of inserting a new `<script>` tag to the
	`<head>`, which `src` attribute's is set to the file's url.

### Callbacks

This framework allows the programmer to define specific callbacks to each request. These callback are:

 * Success: Called if the file is loaded successfully
	
 * Failure: Called if the an error occurs during the loading proccess
	
 * Progress: Called whenever a portion of the file is loaded. Thus, it's called at least once during the
   loading file

Usage & Syntax
==============

It's very simple to use jsRequest. First, you need to include it in your page:
```html
<script type="text/javascript" src="jsRequest-1.0.1.min.js"></script>
```

Then you just need to invoke its methods. In most cases you won't need more than ten lines of code, like
the example below:
```javascript
jsRequest.load("myScript.js");
```

Now, let's suppose you want to load an external script like jQuery, or even a script under the `file://`
protocol. No headaches! Just type it's url:
```javascript
jsRequest.load("http://code.jquery.com/jquery-1.10.2.js");
jsRequest.load("file:///C:/myFile.js");
```
Done! jsRequest will do all the hard work for you.
However, you may also want to know whenever the download fails or not. That's why jsRequest allows you to
configure some options. Just keep reading and see below "The `options` argument" section.

> Tip: Since each method of jsRequest returns the `jsRequest` object itself, it's possible to nestle all methods
> in a single statement, like below:
> ```javascript
> jsRequest
> 	.load("myScript.js")
> 	.load("http://code.jquery.com/jquery-1.10.2.js")
> 	.load("file:///C:/myFile.js");
> ```
> The example above is the pretty exact as the following:
> ```javascript
> jsRequest.load("myScript.js");
> jsRequest.load("http://code.jquery.com/jquery-1.10.2.js");
> jsRequest.load("file:///C:/myFile.js");
> ```
>
> You may also make a single call of the `.load` method:
> ```javascript
> jsRequest.load(
> 		"myScript.js",
> 		"http://code.jquery.com/jquery-1.10.2.js",
> 		"file:///C:/myFile.js"
> 	);
> ```

### The `options` argument

As mentioned in "Callbacks" and "Usage & Syntax" sections, the method `.load` allows you to define callbacks
for each requested file. These callbacks can e compared to the DOM events `onload` (success) and `onerror`
(failure). You can do that in a pretty simple syntax, like JSON:
```javascript
{
	success: function (url, xhr, method, event) {
		// What happens if the file is loaded
	},
	failure: function (url, xhr, method, event) {
		// What happens if the loading failed
	}
}
```

And then just pass it as the last argument of the `.load` method.
Do you remember the example of jQuery? Well, let's how it would be with some options:
```javascript
jsRequest.load("http://code.jquery.com/jquery-1.10.2.js", {
	success: function () {
		alert("Hello, John!");
	},
	failure: function () {
		alert("Sorry, I can't live without jQuery :c");
	}
});
```

If you just want provide the `success` callback, you can simply pass a function instead of the `options`
object:
```javascript
jsRequest.load("myFile.js", function () {
	alert("My file is loaded");
});
```

> Tip: All properties of `options` are optional.

- - -

> Tip: Since you can make a single call for more than one file, you may also do the following:
> ```javascript
> jsRequest.load(
> 	"myScript.js",
> 	"http://code.jquery.com/jquery-1.10.2.js",
> 	"file:///C:/myFile.js",
> 	{
> 		success: function (url) {
> 			alert("Yay! " + url + " is loaded");
> 		},
> 		failure: function (url) {
> 			alert("Couldn't load " + url + " =/");
> 		}
> 	}
> );
> ```
> This way, the `options` argument will be given to each request.

### Interactive loading - The `progress` event

So far, we've learned about `success` and `failure` callbacks. Now we will see the third method of the
`options` argument: the `progress`. This one is called whenever the download advances, which allows the user
to use its creativity to create a custom loading bar, for instance. You just need to add this method to the
`options` argument like described below:
```javascript
{
	success: ...,
	failure: ...,
	progress: function (url, percentage, xhr, method, event) {
		console.log(percentage + "% loaded");
	}
}
```

### Being pacient - The `.wait` method

Another feature of jsRequest is the method `.wait`, which is similar to the `success` callback. This method
takes a single argument, which is a function that will be called right after the last file requested is loaded.
Thanks to this, we can have a request like this:
```javascript
jsRequest
	.load("http://code.jquery.com/jquery-1.10.2.js")
	.wait(function () {
		jsRequest.load("myjQueryPlugin.js", function () {
			alert("Everything is loaded ^^");
		});
	});
```

The good thing of this method is that, if the first argument is a string, then  jsRequest assumes that the programmer
is making a new request, so it behaves like `.load`, which means that the all arguments are urls and the last is
the `options` (if it's not a string). Therefore:
```javascript
jsRequest
	.load("http://code.jquery.com/jquery-1.10.2.js")
	.wait("myjQueryPlugin.js", function () {
		alert("Everything is loaded ^^");
	});
```
Is also valid.

> Tip: If `.wait` is called before the page loads and no request was made before, then it works like the `document`'s
> `onload` event: 
> ```javascript
> jsRequest
> 	.wait(function () {
> 		alert("Page loaded :)");
> 	})
>	.wait("myScript.js");	// loads 'myScript.js' once the page is loaded
> ```

Other Features
==============

### History
jsRequest also stores a request history, where all requested files are stored in array, which is ordered by request
date. Each element of this array is an object that stores the file's url and size and the request's starting date,
ending date and status. This object is described below:
```javascript
{
	/* number */ endDate: ...
	/* number */ size: ...,
	/* number */ startDate: ...,
	/* string */ state: ...,
	/* string */ url: ...
}
```
The history is a property of `jsRequest` can be accessed by `jsRequest.history`.

### Files information

Very similar to the history, the files information is an object where each requested and successfully downloaded file
is an associative index (aka "key") of this object, and each element is an object with the same structure described
in the "History" section.
The files information can be accessed by `jsRequest.files` and alllows the programmer to know some basic information
about each requested file, like this example:
```javascript
jsRequest.load("myScript.js", function (url) {
	alert(url + " took " + (jsRequest.files[url].endDate - jsRequest.files[url].startDate) + " ms to be loaded");
});
```

Compatibility
=============

jsRequest was tested and worked on these browsers:

 * Google Chrome 28.0
 * Mozilla Firefox 22.0
 * Opera 15.0
 * Safari 5.1
 * Internet Explorer 5+

It may also work on other browsers or older versions of the mentioned above. However, they weren't tested yet.

Known bugs
==========

Since IE \<9 doesn't support the `onload` and `onerror` events for `<script>` tags, the `failure` callback
doesn't work on these versions, and therefore it always calls the `success` callback.
Thus, it's recomended to create a custom validator function, like this:
```javascript
jsRequest
	.load("http://code.jquery.com/jquery-1.10.2.js", function () {
		if (window.jQuery) {
			jsRequest.load("myjQueryPlugin.js", function () {
				alert("Everything is loaded ^^");
			});
		} else {
			alert("Sorry, I couldn't find jQuery");
		}
	});
```

Authors
=======
This project was developed and is currently being maintened by [Danilo Valente](https://github.com/danilo-valente/)
and [The Panuto](https://github.com/ThePanuto/)

License
=======

See [LICENSE.md](https://github.com/Panamark/jsRequest/blob/master/LICENSE.md)
