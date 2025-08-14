import {computed, ComputedRef, Ref, ref, watchEffect} from 'vue';
import {WsClient, WsClientOptionsLogin} from './ws-client';
import {useLocalStorage, useSessionStorage} from '@vueuse/core';
import PKCE from 'js-pkce';
import * as z from './zod';
// @ts-expect-error - shvMapType is indirectly used by Zod, it's needed for exporting
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import {type shvMapType} from './rpcvalue';
import {RpcValue} from './rpcvalue';

type GlobalResourceOptions<ResourceType> = {
    shvPath: string;
    method: string;
    validator: z.ZodType<ResourceType>;
    signalName: string;
    signalHandler: (param: RpcValue, resource: Ref<ResourceType | undefined>, reinit: () => void) => void;
};

type VueShvOptions = {
    wsUri: string;
    onRequest: WsClientOptionsLogin['onRequest'];
    azureCodeRedirect?: string;
    mountPoint?: string;
};

type ShvLocalStorage = {
    azureAccessToken?: string;
    azureRedirectTo?: string;
};

type ShvSessionStorage = {
    shvLoginUser?: string;
    shvLoginPassword?: string;

    azureWorkflow?: z.infer<typeof OAuth2AzureWorkflowZod>;
};

const OAuth2AzureWorkflowZod = z.map({
    type: z.literal('oauth2-azure'),
    authorizeUrl: z.string(),
    tokenUrl: z.string(),
    clientId: z.string(),
    scopes: z.string().or(z.array(z.string())),
});

export enum LoginFailureReason {
    NoCredentials,
    AzureTimedOut,
    AzureUnsupported,
    CouldntLogin,
    LoggedOut,
}

type LoginFailure = {
    reason: LoginFailureReason;
    message?: string;
};

const makePkce = (oauthOptions: {azureCodeRedirect: string, clientId: string; authorizeUrl: string; tokenUrl: string; scopes: string | string[]}) => {
    const pkce = new PKCE({
        client_id: oauthOptions.clientId,
        redirect_uri: (() => {
            const url = new URL(globalThis.location.href);
            url.pathname = oauthOptions.azureCodeRedirect;
            url.search = '';
            return url.toString();
        })(),
        authorization_endpoint: oauthOptions.authorizeUrl,
        token_endpoint: oauthOptions.tokenUrl,
        requested_scopes: Array.isArray(oauthOptions.scopes) ? oauthOptions.scopes.join(' ') : oauthOptions.scopes,
    });
    return pkce;
};

export {makePkce as azure};

export function useShv(options: VueShvOptions) {
    const shvLocalStorage = useLocalStorage<ShvLocalStorage>('vue-shv', {});
    const shvSessionStorage = useSessionStorage<ShvSessionStorage>('vue-shv', {});

    const displayName = ref('Loading...');
    const displayShortName = ref('');
    const displayFullName = ref('');
    const displayEmail = ref('');
    const displayPhoto = ref<string>();

    const state = {
        ws: undefined as WsClient | undefined,
        reconnectService: undefined as ReturnType<typeof globalThis.setTimeout> | undefined,
    };

    const waitingForSocket: Array<{
        resolve: (value: WsClient) => void;
        reject: () => void;
    }> = [];

    const resetAzureToken = () => {
        shvLocalStorage.value.azureAccessToken = undefined;
    };

    const azureAvailable = async () => {
        const accessToken = shvLocalStorage.value.azureAccessToken;
        if (accessToken === undefined) {
            return LoginFailureReason.NoCredentials;
        }

        const resp = await fetch('https://graph.microsoft.com/v1.0/me', {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        const json = await resp.json() as unknown;

        if (typeof json === 'object' && json !== null) {
            if ('displayName' in json && typeof json.displayName === 'string') {
                displayName.value = json.displayName;
            }

            if ('givenName' in json && typeof json.givenName === 'string'
                && 'surname' in json && typeof json.surname === 'string') {
                const firstName: string = json.givenName;
                const lastname: string = json.surname;
                displayShortName.value = firstName.charAt(0) + lastname.charAt(0);
                displayFullName.value = firstName + ' ' + lastname;
            }

            if ('mail' in json && typeof json.mail === 'string') {
                displayEmail.value = json.mail;
            }
        }

        const photo = await fetch('https://graph.microsoft.com/v1.0/me/photos/48x48/$value', {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });
        if (photo.ok) {
            displayPhoto.value = URL.createObjectURL(await photo.blob());
        }

        if (!resp.ok) {
            resetAzureToken();
        }

        return resp.ok ? 'azureAvailable' : LoginFailureReason.AzureTimedOut;
    };

    const debug = (...args: string[]) => {
        logContents.value = logContents.value + args.join(' ') + '\n';
        console.debug(...args);
    };

    const azureAuth = (redirectTo: string) => {
        if (options.azureCodeRedirect === undefined) {
            throw new Error('Azure redirect URL not set');
        }

        const {azureCodeRedirect} = options;

        shvLocalStorage.value.azureRedirectTo = redirectTo;
        const noBrokerSupport = () => {
            loginFailure.value = {
                reason: LoginFailureReason.AzureUnsupported,
                message: 'Broker does not support Azure',
            };
        };

        state.ws = new WsClient({
            logDebug: debug,
            wsUri: options.wsUri,
            onWorkflows(workflows) {
                if (!Array.isArray(workflows)) {
                    noBrokerSupport();
                    return;
                }

                for (const workflow of workflows) {
                    const parsedWorkflow = OAuth2AzureWorkflowZod.safeParse(workflow);
                    if (!parsedWorkflow.success) {
                        continue;
                    }

                    shvSessionStorage.value.azureWorkflow = parsedWorkflow.data;

                    globalThis.location.replace(makePkce({...parsedWorkflow.data, azureCodeRedirect}).authorizeUrl());
                }
            },
            onWorkflowsFailed() {
                noBrokerSupport();
            },
        });
    };

    const setShvCredentials = (userName: string, password: string) => {
        shvLogout();
        shvSessionStorage.value.shvLoginUser = userName;
        shvSessionStorage.value.shvLoginPassword = password;
    };

    const rpcCall = async (shvPath: string, method: string, params?: RpcValue) => {
        const shv = await getConnection();
        return shv.callRpcMethod(shvPath, method, params);
    };

    const makeRpcCall = <ResultType>(shvPath: string, method: string, validator: z.ZodType<ResultType>) => async () => {
        const resultOrError = await rpcCall(shvPath, method);
        if (resultOrError instanceof Error) {
            return resultOrError;
        }

        const parsed = validator.safeParse(resultOrError);
        if (!parsed.success) {
            return new Error(parsed.error.message);
        }

        return parsed.data;
    };

    const makeRpcCallParam = <ResultType, ParamType extends RpcValue>(shvPath: string, method: string, _paramType: z.ZodType<ParamType>, validator: z.ZodType<ResultType>) => async (param: ParamType) => {
        const resultOrError = await rpcCall(shvPath, method, param);
        if (resultOrError instanceof Error) {
            return resultOrError;
        }

        const parsed = validator.safeParse(resultOrError);
        if (!parsed.success) {
            return new Error(parsed.error.message);
        }

        return parsed.data;
    };

    const connected = ref<'connected' | 'connecting' | 'disconnected'>('disconnected');
    const logContents = ref('');
    const shvLogout = () => {
        resetAzureToken();
        shvSessionStorage.value.shvLoginUser = undefined;
        shvSessionStorage.value.shvLoginPassword = undefined;

        for (const waiter of waitingForSocket) {
            waiter.reject();
        }

        connected.value = 'disconnected';
        waitingForSocket.length = 0;
        state.ws?.close();
        displayName.value = 'Logged out';
        displayPhoto.value = undefined;
        state.ws = undefined;
    };

    const loginFailure = ref<LoginFailure>();

    const getConnection = async () => {
        if (connected.value === 'connected') {
            return state.ws!;
        }

        return new Promise<WsClient>((resolve, reject) => {
            waitingForSocket.push({resolve, reject});
            if (connected.value === 'connecting') {
                // We should try to connect only once at the same time.
                return;
            }

            connected.value = 'connecting';
            const doConnect = (user: string, password: string, loginType: 'PLAIN' | 'TOKEN') => {
                console.log('Connecting to', options.wsUri);
                const makeLoginOptions = () => {
                    switch (loginType) {
                        case 'PLAIN':
                            return {
                                type: loginType,
                                user,
                                password,
                            };
                        case 'TOKEN':
                            return {
                                type: loginType,
                                token: `oauth2-azure:${password}`,
                            };
                    }
                };

                state.ws = new WsClient({
                    login: makeLoginOptions(),
                    wsUri: options.wsUri,
                    timeout: 120_000,
                    mountPoint: options.mountPoint,
                    logDebug: debug,
                    onConnected() {
                        for (const waiter of waitingForSocket) {
                            waiter.resolve(state.ws!);
                        }

                        waitingForSocket.length = 0;
                        console.log('Connected to', options.wsUri);
                        connected.value = 'connected';
                    },
                    onConnectionFailure(error) {
                        console.error(`Failed to connect to: ${options.wsUri}`, error);
                        shvLogout();
                        loginFailure.value = {
                            reason: LoginFailureReason.CouldntLogin,
                            message: error.message,
                        };
                    },
                    onDisconnected() {
                        connected.value = 'disconnected';
                        const RECONNECT_INTERVAL = 3000;
                        if (shvLocalStorage.value.azureAccessToken !== undefined) {
                            console.log('Disconnected from', options.wsUri, 'reconnecting in', RECONNECT_INTERVAL, 'ms');
                            state.reconnectService = globalThis.setTimeout(async () => {
                                await getConnection();
                            }, RECONNECT_INTERVAL);
                        }
                    },
                    onRequest: options.onRequest,
                });
            };

            const shvUser = shvSessionStorage.value.shvLoginUser;
            const shvPassword = shvSessionStorage.value.shvLoginPassword;
            if (shvUser !== undefined && shvPassword !== undefined) {
                displayName.value = shvUser;
                displayShortName.value = shvUser[0];
                displayFullName.value = shvUser;
                doConnect(shvUser, shvPassword, 'PLAIN');
                return;
            }

            azureAvailable().then(isAzureAvailable => {
                switch (isAzureAvailable) {
                    case LoginFailureReason.NoCredentials:
                    case LoginFailureReason.AzureTimedOut:
                        shvLogout();
                        loginFailure.value = {
                            reason: isAzureAvailable,
                        };
                        return;
                    case 'azureAvailable':
                        break;
                }

                const accessToken = shvLocalStorage.value.azureAccessToken;

                if (accessToken !== undefined) {
                    doConnect('', accessToken, 'TOKEN');
                }
            }).catch((error: unknown) => {
                console.error('Failed to fetch verify azure info, redirecting to the login page in 3 seconds', error);
                setTimeout(() => {
                    loginFailure.value = {
                        reason: LoginFailureReason.CouldntLogin,
                        message: 'Failed to fetch verify azure info',
                    };
                }, 3000);
            });
        });
    };

    function makeGlobalResource<ResourceType>(options: GlobalResourceOptions<ResourceType>): () => Ref<ResourceType | undefined>;
    function makeGlobalResource<ResourceType>(options: GlobalResourceOptions<ResourceType> & {default: ResourceType}): () => ComputedRef<ResourceType>;
    function makeGlobalResource<ResourceType>(options: GlobalResourceOptions<ResourceType> & {default?: ResourceType}): () => ComputedRef<ResourceType> | Ref<ResourceType | undefined> {
        const resource = ref<ResourceType>();
        const resIdentifier = `${options.shvPath}:${options.method}`;

        const resourceCall = makeRpcCall<ResourceType>(options.shvPath, options.method, options.validator);
        const refreshValue = async () => {
            const newResource = await resourceCall();
            if (newResource instanceof Error) {
                return;
            }

            resource.value = newResource;
        };

        const initialize = async () => {
            try {
                await refreshValue();
                const connection = await getConnection();
                connection.subscribe(`Global-${resIdentifier}:`, options.shvPath, options.signalName, (_path: string, _method: string, param: RpcValue) => {
                    options.signalHandler(param, resource, async () => refreshValue().catch((error: unknown) => {
                        console.error(`Failed to initialize ${resIdentifier}`, error);
                    }));
                });
            } catch (error) {
                console.error(`Failed to initialize ${resIdentifier}`, error);
            }
        };

        let initialized = false;

        return () => {
            if (!initialized) {
                initialized = true;
                watchEffect(() => {
                    if (connected.value !== 'connected') {
                        return;
                    }

                    initialize().catch((error: unknown) => {
                        console.error(`Failed to initialize ${resIdentifier}`, error);
                    });
                });
            }

            if ('default' in options) {
                const defaultValue = options.default;
                const withDefault = computed(() => {
                    if (resource.value === undefined) {
                        return defaultValue;
                    }

                    return resource.value;
                });
                return withDefault;
            }

            return resource;
        };
    }

    const azureHandlerError = ref('');

    const handleAzureCode = async () => {
        if (shvSessionStorage.value.azureWorkflow === undefined) {
            azureHandlerError.value = 'Azure error: no active login procedure';
            return;
        }

        if (options.azureCodeRedirect === undefined) {
            throw new Error('Azure redirect URL not set');
        }

        const {azureCodeRedirect} = options;

        return makePkce({...shvSessionStorage.value.azureWorkflow, azureCodeRedirect}).exchangeForAccessToken(globalThis.location.href).then(resp => {
            shvSessionStorage.value.azureWorkflow = undefined;
            const token = resp.access_token;
            if (token === undefined) {
                azureHandlerError.value = 'Couldn\'t authenticate to Azure: unable to exchange access token';
                return;
            }

            // Store the token and remove the code from the query params.
            shvLogout();
            shvLocalStorage.value.azureAccessToken = token;
            const redirectTo = shvLocalStorage.value.azureRedirectTo;
            if (redirectTo === undefined) {
                azureHandlerError.value = 'Couldn\'t authenticate to Azure: no redirect URL';
                return;
            }

            shvLocalStorage.value.azureRedirectTo = undefined;
            return redirectTo;
        }).catch((error: unknown) => {
            azureHandlerError.value = `Couldn't authenticate to Azure: ${JSON.stringify(error)}`;
        });
    };

    return {
        azureAuth,
        azureHandlerError,
        connected,
        displayEmail,
        displayFullName,
        displayName,
        displayPhoto,
        displayShortName,
        getConnection,
        handleAzureCode,
        logContents,
        loginFailure,
        makeGlobalResource,
        makeRpcCall,
        makeRpcCallParam,
        rpcCall,
        setShvCredentials,
        shvLocalStorage,
        shvLogout,
        shvSessionStorage,
    };
}

export const fullReloadHandler = (_param: RpcValue, _resource: unknown, reinit: () => void) => {
    reinit();
};
