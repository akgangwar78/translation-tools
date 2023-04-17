import browser from 'webextension-polyfill';

import { defaultConfig } from '../config';

import { AppConfigType } from '../types/runtime';
import { isBackgroundContext, isChromium } from '../lib/browser';
import { AppThemeControl } from '../lib/browser/AppThemeControl';
import { TextTranslatorStorage } from '../pages/popup/tabs/TextTranslator/TextTranslator.utils/TextTranslatorStorage';

import { clearCache } from '../requests/backend/clearCache';
import { sendAppConfigUpdateEvent } from '../requests/global/appConfigUpdate';

import { TranslateSelectionContextMenu } from './ContextMenus/TranslateSelectionContextMenu';
import { migrateAll } from './migrations/migrationsList';

import { ConfigStorage, ObservableAsyncStorage } from './ConfigStorage/ConfigStorage';

import { Background } from './Background';
import { requestHandlers } from './Background/requestHandlers';

import { TranslatePageContextMenu } from './ContextMenus/TranslatePageContextMenu';
import { getAllTabs } from '../lib/browser/tabs';
import { createEvent, createStore, Store } from 'effector';

type OnInstalledData = null | browser.Runtime.OnInstalledDetailsType;

/**
 * Manage global states and application context
 */
export class App {
	/**
	 * Run application
	 */
	public static async main() {
		const onInstalled = createEvent<browser.Runtime.OnInstalledDetailsType>();
		browser.runtime.onInstalled.addListener(onInstalled);

		const $onInstalledData = createStore<OnInstalledData>(null);
		$onInstalledData.on(onInstalled, (_, onInstalledData) => onInstalledData);

		// Migrate data
		await migrateAll();

		const config = new ConfigStorage(defaultConfig);
		const observableConfig = new ObservableAsyncStorage(config);
		const background = new Background(observableConfig);

		const app = new App({
			config: observableConfig,
			background,
			$onInstalledData,
		});
		await app.start();
	}

	private readonly config: ObservableAsyncStorage<AppConfigType>;
	private readonly background: Background;
	private readonly $onInstalledData: Store<OnInstalledData>;
	constructor({
		config,
		background,
		$onInstalledData,
	}: {
		config: ObservableAsyncStorage<AppConfigType>;
		background: Background;
		$onInstalledData: Store<OnInstalledData>;
	}) {
		this.config = config;
		this.background = background;
		this.$onInstalledData = $onInstalledData;
	}

	private isStarted = false;
	public async start() {
		if (this.isStarted) {
			throw new Error('Application already started');
		}

		this.isStarted = true;

		await this.background.start();

		await this.setupRequestHandlers();
		await this.handleConfigUpdates();

		if (isChromium()) {
			this.$onInstalledData.watch(async (details) => {
				console.warn('Inject CS 2', details);

				const tabs = await getAllTabs();
				tabs.forEach((tab) => {
					if (tab.status === 'unloaded') return;
					if (
						!tab.url ||
						tab.url.startsWith('chrome://') ||
						tab.url.startsWith('https://chrome.google.com')
					)
						return;

					console.log(tab);
					['common.js', 'contentscript.js'].forEach((file) => {
						browser.tabs.executeScript(tab.id, {
							file,
						});
					});
				});
			});
		}
	}

	private async setupRequestHandlers() {
		// Prevent run it again on other pages, such as options page
		if (isBackgroundContext()) {
			requestHandlers.forEach((factory) => {
				factory({
					config: this.config,
					backgroundContext: this.background,
				});
			});
		}
	}

	private async handleConfigUpdates() {
		const $appConfig = await this.config.getObservableStore();

		// Send update event
		$appConfig.watch((config) => {
			sendAppConfigUpdateEvent(config);
		});

		// Update icon
		const appThemeControl = new AppThemeControl();
		$appConfig
			.map((config) => config.appIcon)
			.watch((appIcon) => {
				appThemeControl.setAppIconPreferences(appIcon);
			});

		// Clear cache while disable
		$appConfig
			.map((config) => config.scheduler.useCache)
			.watch((useCache) => {
				if (!useCache) {
					clearCache();
				}
			});

		// Clear TextTranslator state
		const textTranslatorStorage = new TextTranslatorStorage();
		$appConfig
			.map((config) => config.textTranslator.rememberText)
			.watch((rememberText) => {
				if (!rememberText) {
					textTranslatorStorage.forgetText();
				}
			});

		// Configure context menu
		const translateSelectionContextMenu = new TranslateSelectionContextMenu();
		$appConfig
			.map((config) => {
				const { enabled, mode } = config.selectTranslator;
				const isEnabled = enabled && mode === 'contextMenu';
				return isEnabled;
			})
			.watch((isEnabled) => {
				if (isEnabled) {
					translateSelectionContextMenu.enable();
				} else {
					translateSelectionContextMenu.disable();
				}
			});

		const translatePageContextMenu = new TranslatePageContextMenu();
		$appConfig
			.map((config) => config.pageTranslator.enableContextMenu)
			.watch((isEnabled) => {
				if (isEnabled) {
					translatePageContextMenu.enable();
				} else {
					translatePageContextMenu.disable();
				}
			});
	}
}
