import asyncCommand from '../lib/async-command';
import fs from 'fs.promised';
import copy from 'recursive-copy';
import glob from 'glob';
import mkdirp from 'mkdirp';
import ora from 'ora';
import chalk from 'chalk';
import inquirer from 'inquirer';
import promisify from 'es6-promisify';
import path from 'path';
import { install, initialize, pkgScripts, initGit, trimLeft } from './../lib/setup';

const TEMPLATES = {
	full: 'examples/full',
	empty: 'examples/empty',
	root: 'examples/root',
	simple: 'examples/simple'
};

export default asyncCommand({
	command: 'create <name> [dest]',

	desc: 'Create a new application.',

	builder: {
		name: {
			description: 'directory and package name for the new app'
		},
		force: {
			description: 'Force option to create the directory for the new app',
			default: false
		},
		yarn: {
			description: "Use 'yarn' instead of 'npm'",
			type: 'boolean',
			default: false
		},
		git: {
			description: 'Initialize version control using git',
			type: 'boolean',
			default: false
		},
		install: {
			description: 'Install dependencies',
			type: 'boolean',
			default: true
		}
	},

	async handler(argv) {
		let isYarn = argv.yarn === true;
		let template = TEMPLATES[argv.type];

		if (!template) {
			throw Error(`Unknown app template "${argv.type}".`);
		}

		let target = path.resolve(process.cwd(), argv.dest || argv.name);

		let exists = false;
		try {
			exists = (await fs.stat(target)).isDirectory();
		}
		catch (err) {}

		if (exists && argv.force) {
			const question = {
				type: 'confirm',
				name: 'enableForce',
				message: `You are using '--force'. Do you wish to continue?`,
				default: false,
			};

			let { enableForce } = await inquirer.prompt(question);

			if (enableForce) {
				process.stdout.write('Initializing project in the current directory...\n');
			} else {
				process.stderr.write(chalk.red('Error: Cannot initialize in the current directory\n'));
				process.exit(1);
			}
		}

		if (exists && !argv.force) {
			process.stderr.write(chalk.red('Error: Cannot initialize in the current directory, please specify a different destination or use --force\n'));
			process.exit(1);
		}

		let spinner = ora({
			text: 'Creating project',
			color: 'magenta'
		}).start();

		if (!exists) {
			await promisify(mkdirp)(target);
		}

		await copy(
			path.resolve(__dirname, '../..', template),
			target,
			{ filter: ['**/*', '!build'] }
		);

		spinner.text = 'Initializing project';

		await initialize(isYarn, target);

		let pkg = JSON.parse(await fs.readFile(path.resolve(target, 'package.json')));

		pkg.scripts = await pkgScripts(isYarn, pkg);

		try {
			await fs.stat(path.resolve(target, 'src'));
		}
		catch (err) {
			pkg.scripts.test = pkg.scripts.test.replace('src', '.');
		}

		pkg.eslintConfig = {
			extends: 'eslint-config-synacor'
		};

		await fs.writeFile(path.resolve(target, 'package.json'), JSON.stringify(pkg, null, 2));

		if (argv.install) {
			spinner.text = 'Installing dev dependencies';

			await install(isYarn, target, [
				'preact-cli',
				'if-env',
				'eslint',
				'eslint-config-synacor'
			], 'dev');

			spinner.text = 'Installing dependencies';

			await install(isYarn, target, [
				'preact',
				'preact-compat',
				'preact-router'
			]);
		}

		spinner.succeed('Done!\n');

		if (argv.git) {
			await initGit(target);
		}

		let pfx = isYarn ? 'yarn' : 'npm run';

		return trimLeft(`
			To get started, cd into the new directory:
			  \u001b[32mcd ${path.relative(process.cwd(), target)}\u001b[39m

			To start a development live-reload server:
			  \u001b[32m${pfx} start\u001b[39m

			To create a production build (in ./build):
			  \u001b[32m${pfx} build\u001b[39m

			To start a production HTTP/2 server:
			  \u001b[32m${pfx} serve\u001b[39m
		`) + '\n';
	}
});
