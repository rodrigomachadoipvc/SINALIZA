import * as SecureStore from 'expo-secure-store';

const KEY = 'sinaliza.session';

/** Tokens live in the device keychain/keystore (expo-secure-store), never in plain storage. */
export const tokenStorage = {
  async read(): Promise<string | null> {
    return SecureStore.getItemAsync(KEY);
  },
  async write(value: string): Promise<void> {
    await SecureStore.setItemAsync(KEY, value);
  },
  async clear(): Promise<void> {
    await SecureStore.deleteItemAsync(KEY);
  },
};
