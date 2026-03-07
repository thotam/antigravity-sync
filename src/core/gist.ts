// GistService — CRUD operations for GitHub Gist API
// Uses "AntigravitySync" as gist description to avoid conflict with original extension

import axios, { AxiosError } from 'axios';
import { AuthenticationSession, authentication } from 'vscode';
import {
	IGist,
	IGistCollection,
	IGistCreateRequest,
	IGistUpdateRequest,
	IProfile,
} from '../models/interfaces';
import Logger from './logger';

export default class GistService {
	/** Identifier for master gist — different from original to avoid conflicts */
	public description: string = 'AntigravitySync';
	public baseUrl: string = 'https://api.github.com/gists';
	public masterId?: string;

	private authSession: AuthenticationSession;
	private logger: Logger;

	private constructor(logger: Logger, authSession: AuthenticationSession) {
		this.logger = logger;
		this.authSession = authSession;
	}

	/** Initialize GistService with GitHub OAuth session */
	public static async initialize(logger: Logger) {
		try {
			const authSession = await authentication.getSession('github', ['gist'], {
				createIfNone: true,
			});
			return new GistService(logger, authSession);
		} catch (err) {
			logger.error(
				'User rejected request for GitHub session token.',
				'GistService.initialize()',
				false,
				err
			);
			return undefined;
		}
	}

	/** Find master gist (description = "AntigravitySync") */
	public async getMaster() {
		if (this.masterId) {
			const master = await this.getGist(this.masterId);
			if (master) {
				return master;
			}
		}
		const master = (await this.getCollection())?.find(
			(gist) => gist.description === this.description
		);
		if (master) {
			this.masterId = master.id;
		}
		return master;
	}

	/** Create a new master gist with a default profile */
	public async createMaster(profile: IProfile): Promise<IGist> {
		try {
			const gistData: IGistCreateRequest = {
				description: this.description,
				public: false,
				files: {
					[`${profile.profileName}.json`]: {
						content: JSON.stringify(profile, null, 2),
					},
				},
			};

			const response = await axios.post(this.baseUrl, gistData, {
				headers: this.createHeaders(),
			});
			return response.data as IGist;
		} catch (err) {
			throw this.handleGistError(
				err,
				`create new gist`,
				'GistService.createMaster'
			);
		}
	}

	/** Fetch profile data from raw_url */
	public async getProfile(rawUrl: string) {
		try {
			if (!rawUrl) {
				throw new Error('Raw URL is required');
			}

			const response = await axios.get(rawUrl, {
				headers: this.createHeaders(),
			});

			const data =
				typeof response.data === 'string'
					? JSON.parse(response.data)
					: response.data;

			return data as IProfile;
		} catch (error) {
			throw this.handleGistError(
				error,
				'fetch profile content',
				'GistService.getProfile'
			);
		}
	}

	/** Create or update a profile in the master gist */
	public async createProfile(profile: IProfile): Promise<IGist> {
		try {
			const gistData: IGistUpdateRequest = {
				files: {
					[`${profile.profileName}.json`]: {
						content: JSON.stringify(profile, null, 2),
					},
				},
			};

			const response = await axios.patch(
				`${this.baseUrl}/${this.masterId}`,
				gistData,
				{ headers: this.createHeaders() }
			);
			return response.data as IGist;
		} catch (error) {
			throw this.handleGistError(
				error,
				`update/create profile ${profile.profileName}`,
				'GistService.createProfile'
			);
		}
	}

	/** Delete a profile from the master gist */
	public async deleteProfile(profileName: string): Promise<void> {
		try {
			const gistData: IGistUpdateRequest = {
				files: {
					[`${profileName}.json`]: {
						content: ``,
					},
				},
			};

			await axios.patch(`${this.baseUrl}/${this.masterId}`, gistData, {
				headers: this.createHeaders(),
			});
		} catch (error) {
			throw this.handleGistError(
				error,
				`delete profile ${profileName}`,
				'GistService.deleteProfile'
			);
		}
	}

	/** Get all user gists */
	private async getCollection() {
		try {
			const response = await axios.get(this.baseUrl, {
				headers: this.createHeaders(),
			});
			return response.data as IGistCollection;
		} catch (err) {
			throw this.handleGistError(
				err,
				`fetch all gists`,
				'GistService.getCollection'
			);
		}
	}

	/** Get a gist by ID */
	public async getGist(gistId: string) {
		try {
			const response = await axios.get(`${this.baseUrl}/${gistId}`, {
				headers: this.createHeaders(),
			});
			return response.data as IGist;
		} catch (err) {
			throw this.handleGistError(
				err,
				`fetch gist ${gistId}`,
				'GistService.getGist'
			);
		}
	}

	/** Create headers for GitHub API requests */
	private createHeaders() {
		return {
			Authorization: `Bearer ${this.authSession.accessToken}`,
			Accept: 'application/vnd.github.v3+json',
			'User-Agent': 'AntigravitySync-Extension',
		};
	}

	/** Detailed error handling for GitHub API */
	private handleGistError(error: any, operation: string, origin: string): never {
		let message = `Failed to ${operation}`;
		if (axios.isAxiosError(error)) {
			const axiosError = error as AxiosError;
			if (axiosError.response) {
				const status = axiosError.response.status;
				const data = axiosError.response.data as any;
				switch (status) {
					case 401:
						message = `Authentication failed during ${operation}. Please check your GitHub token.`;
						break;
					case 403:
						message = `Access forbidden during ${operation}. Check your GitHub permissions.`;
						break;
					case 404:
						message = `Resource not found during ${operation}. The gist may have been deleted.`;
						break;
					case 422:
						message = `Invalid data during ${operation}: ${
							data?.message || 'Unknown validation error'
						}`;
						break;
					case 429:
						message = `Rate limit exceeded during ${operation}. Please try again later.`;
						break;
					default:
						message = `GitHub API error during ${operation}: ${
							data?.message || axiosError.message
						}`;
				}
			} else if (axiosError.request) {
				message = `Network error during ${operation}. Please check your internet connection.`;
			}
		}
		this.logger.debugObject(error, origin);
		this.logger.error(message, origin, true, error);
		throw new Error(message);
	}
}
