'use strict';

var config = require('config-path')();
var fs = require('fs');
var glob = require('glob');
var marked = require('marked');
var merge = require('merge');
var mkdirp = require('mkdirp');
var nib = require('nib');
var path = require('path');
var pug = require('pug');
var stylus = require('stylus');
var UglifyJS = require('uglify-js');
var yaml = require('js-yaml');

var renderer = new marked.Renderer();

renderer.image = function(href, title, text) {
	var tags = {};
	if (title)
		title.split(',').forEach(function(tag) {
			tags[tag.trim()] = true;
		});

	var classList = [];
	if (tags.center)
		classList.push('center');
	if (tags.fullwidth)
		classList.push('fullwidth');
	if (tags.halfwidth)
		classList.push('halfwidth');
	var classAttribute = classList.length ? ' class="' + classList.join(' ') + '"' : '';

	var out;
	if (tags.iframe) {
		out = '<iframe' + classAttribute + ' src="' + href + '" frameBorder="0"></iframe>';
	} else {
		out = '<img' + classAttribute + ' src="' + href + '" alt="' + text + '"/>';
	}

	if (tags['16:9']) {
		return '<div class="aspect-ratio aspect-ratio-sixteen-nine">' + out + '</div>';
	} else {
		return out;
	}
};

renderer.link = function(href, title, text) {
	var out = '<a href="' + href + '"';
	if (href.indexOf('//') !== -1)
		out += ' target="_blank"';
	if (title)
		out += ' title="' + title + '"';
	out += '>' + text + '</a>';
	return out;
};

marked.setOptions({
	renderer: renderer,
});

var projects = {};

function loadDir(dirName) {
	var projects = {};
	fs.readdirSync(dirName).forEach(function(projectName) {
		var projectPath = path.join(dirName, projectName);
		var dataPath = path.join(projectPath, 'data.yml');
		if (fs.existsSync(dataPath)) {
			console.log('Loading %s/%s', dirName, projectName);

			var data = yaml.load(fs.readFileSync(dataPath).toString());

			var pages = {};

			fs.readdirSync(projectPath).forEach(function(fileName) {
				if (path.extname(fileName) === '.md') {
					var name = path.basename(fileName, '.md');
					var content = fs.readFileSync(path.join(projectPath, fileName)).toString();
					pages[name] = marked(content);
				}
			});

			projects[projectName] = merge(data, {
				name: projectName,
				pages: pages,
				path: projectPath,
				url: '/' + dirName + '/' + projectName + '/',
			});
		}
	});
	return projects;
}

var projects = loadDir('projects');
var pages = loadDir('pages');

var collections = {};

Object.keys(config.collections).forEach(function(collectionName) {
	var collection = config.collections[collectionName];

	var collectionProjects = [];
	collection.projects.forEach(function(projectName) {
		var project = projects[projectName];
		if (!project) return;
		project.collectionName = collectionName;
		collectionProjects.push(project);
	});

	collections[collectionName] = merge(collection, {
		name: collectionName,
		projects: collectionProjects,
		url: '/collections/' + collectionName + '/',
	});
});

var views = {};

['collection', 'page'].forEach(function(viewName) {
	views[viewName] = pug.compileFile(path.join('views', viewName + '.pug'), {
		filename: viewName,
	});
});

function writeFile(file, data) {
	mkdirp.sync(path.dirname(file));
	fs.writeFileSync(file, data);
}

Object.keys(collections).forEach(function(collectionName) {
	console.log('Generating collection %s', collectionName);

	var collection = collections[collectionName];

	var html = views.collection(merge(collection, {
		currentCollection: collectionName,
		_collections: collections,
		_projects: projects,
		config: config,
	}));

	writeFile(path.join('generated', 'collections', collectionName, 'index.html'), html);

	if (config.default.collection === collectionName)
		writeFile(path.join('generated', 'index.html'), html);
});

function outputDir(dirName, obj) {
	Object.keys(obj).forEach(function(projectName) {
		console.log('Generating %s/%s', dirName, projectName);

		var project = obj[projectName];

		Object.keys(project.pages).forEach(function(pageName) {
			var html = views.page(merge(project, {
				body: project.pages[pageName],
				currentCollection: project.collectionName,
				_collections: collections,
				_projects: projects,
				config: config,
			}));

			writeFile(path.join('generated', dirName, projectName, pageName + '.html'), html);
		});
	});

	glob('!(*.md|*.yml|.*)', {
		cwd: dirName,
		matchBase: true,
		nodir: true,
	}, function(err, files) {
		if (err) throw err;
		return files.forEach(function(file) {
			var fromName = path.join(dirName, file);
			var toName = path.join('generated', dirName, file);
			fs.createReadStream(fromName).pipe(fs.createWriteStream(toName));
		});
	});
}

outputDir('projects', projects);
outputDir('pages', pages);

var style = fs.readFileSync(path.join('styles', 'index.styl')).toString();
stylus(style)
	.set('filename', 'index.css')
	.set('compress', true)
	.use(nib())
	.import('nib')
	.render(function(err, css){
		if (err) throw err;
		writeFile(path.join('generated', 'index.css'), css);
	});

glob('!(.*)', {
	cwd: 'scripts',
	matchBase: true,
	nodir: true,
}, function(err, files) {
	if (err) throw err;
	var result = UglifyJS.minify(files.map(function(file) {
		return path.join('scripts', file);
	}));
	writeFile(path.join('generated', 'index.js'), result.code);
});

glob('!(.*)', {
	cwd: 'static',
	matchBase: true,
	nodir: true,
}, function(err, files) {
	if (err) throw err;
	return files.forEach(function(file) {
		var fromName = path.join('static', file);
		var toName = path.join('generated', file);
		mkdirp.sync(path.dirname(toName));
		fs.createReadStream(fromName).pipe(fs.createWriteStream(toName));
	});
});
