(function() {
	'use strict';

	var isMenuVisible = false;
	var menuButtonElement = document.getElementById('menu-button');
	var menuElements = document.querySelectorAll('.menu');
	menuButtonElement.addEventListener('click', function(event) {
		event.preventDefault();
		isMenuVisible = !isMenuVisible;
		for (var i = 0; i < menuElements.length; ++i)
			menuElements[i].style.display = (isMenuVisible ? 'block' : 'none');
	});
})();
