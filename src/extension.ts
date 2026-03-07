// Entry point — Antigravity Sync Extension
// Register commands, StatusBar, initialize controller & gist service

import * as vscode from 'vscode';
import Logger from './core/logger';
import { IProfile } from './models/interfaces';
import SyncController from './core/sync-controller';
import GistService from './core/gist';

export let logger: Logger;
let statusBarItem: vscode.StatusBarItem;

export async function activate(ctx: vscode.ExtensionContext) {
	try {
		// Initialize Logger
		logger = new Logger();
		logger.info('Extension activation started');

		// Initialize StatusBar
		statusBarItem = vscode.window.createStatusBarItem(
			vscode.StatusBarAlignment.Right,
			100
		);
		statusBarItem.text = '$(sync) Antigravity Sync';
		statusBarItem.tooltip = 'Antigravity Sync: Click to show menu';
		statusBarItem.command = 'antigravitysync.showmenu';
		statusBarItem.show();

		// Initialize SyncController
		const controller: SyncController | undefined =
			await SyncController.initialize(logger, ctx);
		if (!controller) {
			logger.error('Failed to initialize Antigravity Sync', 'activate', true);
			deactivate(true);
			return;
		}

		// Initialize GistService
		const gistService: GistService | undefined = await GistService.initialize(
			logger
		);
		if (!gistService) {
			logger.error(
				'Failed to create Gist Service. A valid GitHub connection is required.',
				'activate',
				true
			);
			deactivate(true);
			return;
		}

		// Find or create Master Gist
		let masterList = await gistService.getMaster();
		if (!masterList) {
			const defaultProfile = await controller.getActiveProfile();
			defaultProfile.profileName = 'Origin';
			masterList = await gistService.createMaster(defaultProfile as IProfile);
			ctx.globalState.update('masterId', masterList.id);
			gistService.masterId = masterList.id;
		} else {
			if (masterList.id !== ctx.globalState.get('masterId')) {
				ctx.globalState.update('masterId', masterList.id);
			}
		}

		// Validate master list
		if (!ctx.globalState.get('masterId')) {
			logger.error(
				'Failed to find Master Gist ID. Check logs for more details.',
				'activate',
				true
			);
			deactivate(true);
			return;
		}

		// ===== Register Commands =====

		const CreateProfile = vscode.commands.registerCommand(
			'antigravitysync.createprofile',
			async () => {
				try {
					const profileName = await vscode.window.showInputBox({
						prompt: 'Enter profile name',
						validateInput: (value) => {
							if (!value || value.trim().length === 0) {
								return 'Profile name cannot be empty';
							}
							if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
								return 'Profile name can only contain letters, numbers, hyphens, and underscores';
							}
							return null;
						},
					});

					if (!profileName) {
						return;
					}

					await vscode.window.withProgress(
						{
							location: vscode.ProgressLocation.Notification,
							title: `Creating profile "${profileName}"...`,
							cancellable: false,
						},
						async (progress) => {
							progress.report({
								message: 'Reading current configuration...',
							});

							const currentProfile = await controller.getActiveProfile();
							const profile: IProfile = {
								profileName,
								settings: currentProfile.settings!,
								extensions: currentProfile.extensions!,
								keybindings: currentProfile.keybindings!,
							};

							progress.report({
								message: 'Uploading to GitHub...',
							});
							await gistService.createProfile(profile);

							logger.info(
								`Created profile: ${profileName}`,
								false,
								'CreateProfile'
							);
							vscode.window.showInformationMessage(
								`Profile "${profileName}" created successfully!`
							);
						}
					);
				} catch (error) {
					logger.error(`Failed to create profile`, 'CreateProfile', true, error);
				}
			}
		);

		const PullProfile = vscode.commands.registerCommand(
			'antigravitysync.pullprofile',
			async () => {
				try {
					const masterGist = await gistService.getMaster();
					if (!masterGist) {
						vscode.window.showErrorMessage('No master gist found');
						return;
					}

					const profileNames = Object.keys(masterGist.files).filter((name) =>
						name.endsWith('.json')
					);

					if (profileNames.length === 0) {
						vscode.window.showInformationMessage('No profiles found');
						return;
					}

					const selectedProfile = await vscode.window.showQuickPick(
						profileNames.map((name) => ({
							label: name.replace('.json', ''),
							description: `Profile: ${name.replace('.json', '')}`,
						})),
						{ placeHolder: 'Select a profile to pull' }
					);

					if (!selectedProfile) {
						return;
					}

					await vscode.window.withProgress(
						{
							location: vscode.ProgressLocation.Notification,
							title: `Pulling profile "${selectedProfile.label}"...`,
							cancellable: false,
						},
						async (progress) => {
							progress.report({
								message: 'Fetching remote profile data...',
								increment: 25,
							});
							const profileFile = masterGist.files[`${selectedProfile.label}.json`];
							const profile = await gistService.getProfile(profileFile.raw_url);

							progress.report({
								message: 'Applying profile locally...',
								increment: 50,
							});

							await controller.updateLocalProfile(profile);

							progress.report({
								message: 'Complete!',
								increment: 100,
							});
						}
					);

					logger.info(
						`Pulled profile: ${selectedProfile.label}`,
						false,
						'PullProfile'
					);
					const reload = await vscode.window.showInformationMessage(
						`Profile "${selectedProfile.label}" applied successfully! Reload window to see all changes?`,
						'Reload Now',
						'Later'
					);

					if (reload === 'Reload Now') {
						await vscode.commands.executeCommand('workbench.action.reloadWindow');
					}
				} catch (error) {
					logger.error(`Failed to pull profile`, 'PullProfile', true, error);
				}
			}
		);

		const UpdateProfile = vscode.commands.registerCommand(
			'antigravitysync.updateprofile',
			async () => {
				try {
					const masterGist = await gistService.getMaster();
					if (!masterGist) {
						vscode.window.showErrorMessage('No master gist found');
						return;
					}

					const profileNames = Object.keys(masterGist.files).filter((name) =>
						name.endsWith('.json')
					);

					if (profileNames.length === 0) {
						vscode.window.showInformationMessage('No profiles found to update');
						return;
					}

					const selectedProfile = await vscode.window.showQuickPick(
						profileNames.map((name) => ({
							label: name.replace('.json', ''),
							description: `Update profile: ${name.replace('.json', '')}`,
						})),
						{ placeHolder: 'Select a profile to update' }
					);

					if (!selectedProfile) {
						return;
					}

					await vscode.window.withProgress(
						{
							location: vscode.ProgressLocation.Notification,
							title: `Updating profile "${selectedProfile.label}"...`,
							cancellable: false,
						},
						async (progress) => {
							progress.report({
								message: 'Reading current configuration...',
							});

							const currentProfile = await controller.getActiveProfile();
							const updatedProfile: IProfile = {
								profileName: selectedProfile.label,
								settings: currentProfile.settings!,
								extensions: currentProfile.extensions!,
								keybindings: currentProfile.keybindings!,
							};

							progress.report({
								message: 'Uploading to GitHub...',
							});
							await gistService.createProfile(updatedProfile);

							logger.info(
								`Updated profile: ${selectedProfile.label}`,
								false,
								'UpdateProfile'
							);
							vscode.window.showInformationMessage(
								`Profile "${selectedProfile.label}" updated successfully!`
							);
						}
					);
				} catch (error) {
					logger.error(`Failed to update profile`, 'UpdateProfile', true, error);
				}
			}
		);

		const DeleteProfile = vscode.commands.registerCommand(
			'antigravitysync.deleteprofile',
			async () => {
				try {
					const masterGist = await gistService.getMaster();
					if (!masterGist) {
						vscode.window.showErrorMessage('No master gist found');
						return;
					}

					const profileNames = Object.keys(masterGist.files).filter((name) =>
						name.endsWith('.json')
					);

					if (profileNames.length === 0) {
						vscode.window.showInformationMessage('No profiles found to delete');
						return;
					}

					const selectedProfile = await vscode.window.showQuickPick(
						profileNames.map((name) => ({
							label: name.replace('.json', ''),
							description: `Delete profile: ${name.replace('.json', '')}`,
						})),
						{ placeHolder: 'Select a profile to delete' }
					);

					if (!selectedProfile) {
						return;
					}

					await vscode.window.withProgress(
						{
							location: vscode.ProgressLocation.Notification,
							title: `Deleting profile "${selectedProfile.label}"...`,
							cancellable: false,
						},
						async (progress) => {
							await gistService.deleteProfile(selectedProfile.label);
							logger.info(
								`Deleted profile: ${selectedProfile.label}`,
								false,
								'DeleteProfile'
							);
							vscode.window.showInformationMessage(
								`Profile "${selectedProfile.label}" deleted successfully!`
							);
						}
					);
				} catch (error) {
					logger.error(`Failed to delete profile`, 'DeleteProfile', true, error);
				}
			}
		);

		const ShowMenu = vscode.commands.registerCommand(
			'antigravitysync.showmenu',
			async () => {
				const options = [
					{
						label: '$(plus) Create Profile',
						command: 'antigravitysync.createprofile',
					},
					{
						label: '$(cloud-download) Pull Profile',
						command: 'antigravitysync.pullprofile',
					},
					{
						label: '$(sync) Update Profile',
						command: 'antigravitysync.updateprofile',
					},
					{
						label: '$(trash) Delete Profile',
						command: 'antigravitysync.deleteprofile',
					},
					{
						label: '$(output) Show Logs',
						command: 'antigravitysync.showlogs',
					},
					{
						label: '$(file-symlink-directory) Set Paths Manually',
						command: 'antigravitysync.setpathsmanually',
					},
				];

				const selected = await vscode.window.showQuickPick(options, {
					placeHolder: 'Choose an action',
				});
				if (selected) {
					await vscode.commands.executeCommand(selected.command);
				}
			}
		);

		const SetManualPath = vscode.commands.registerCommand(
			'antigravitysync.setpathsmanually',
			async () => {
				const options = [
					{
						label: '$(settings) Set Settings Path',
						type: 'settings' as const,
					},
					{
						label: '$(keyboard) Set Keybindings Path',
						type: 'keybindings' as const,
					},
				];

				const selected = await vscode.window.showQuickPick(options, {
					placeHolder: 'Choose configuration file to set',
				});

				if (selected) {
					try {
						const path = await SyncController.setManualPath(
							selected.type,
							`Select ${selected.type}.json file`
						);
						ctx.globalState.update(`${selected.type}Path`, path);
						logger.info(
							`${selected.type} path updated to: ${path}`,
							false,
							'SetManualPath'
						);
						vscode.window.showInformationMessage(
							`${selected.type} path updated successfully!`
						);
					} catch (error) {
						logger.error(
							`Failed to set ${selected?.type} path`,
							'SetManualPath',
							true,
							error
						);
					}
				}
			}
		);

		const ShowLogs = vscode.commands.registerCommand(
			'antigravitysync.showlogs',
			() => {
				logger.show();
			}
		);

		// Register all commands
		ctx.subscriptions.push(
			CreateProfile,
			PullProfile,
			UpdateProfile,
			DeleteProfile,
			SetManualPath,
			ShowMenu,
			ShowLogs,
			statusBarItem,
			logger
		);

		logger.info('Extension activation completed successfully', false, 'activate');
	} catch (error) {
		logger.error(`${error}`, 'activate', false, error);
	}
}

export function deactivate(preserveLogger: boolean = false) {
	logger?.info('Extension deactivated');
	statusBarItem?.dispose();
	if (!preserveLogger) {
		logger?.dispose();
	}
}
