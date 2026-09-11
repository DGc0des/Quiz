import 'react-native-get-random-values';
import { useCallback, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, createNavigationContainerRef, StackActions } from '@react-navigation/native';
import * as SplashScreen from 'expo-splash-screen';
import {
  useFonts,
  Fraunces_700Bold,
  Fraunces_800ExtraBold,
  Fraunces_900Black,
} from '@expo-google-fonts/fraunces';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import AppNavigator, { linking } from './src/navigation/AppNavigator';
import ErrorBoundary from './src/components/ErrorBoundary';
import AuthGate from './src/components/AuthGate';

import { GameConnectionBanner } from './src/components/GameConnectionBanner';
import { saveActiveGame, clearActiveGame } from './src/utils/savedGame';
import { gameDestination } from './src/utils/gameFlow';
import { Game, RootStackParamList } from './src/types';
const navigationRef = createNavigationContainerRef<RootStackParamList>();
SplashScreen.preventAutoHideAsync();

export default function App() {
  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const trackRoute = useCallback(() => {
    const params = navigationRef.getCurrentRoute()?.params as { gameId?: string; playerId?: string } | undefined;
    setActiveGameId(params?.gameId ?? null);
    if (params?.gameId && params.playerId) void saveActiveGame({ gameId: params.gameId, playerId: params.playerId });
  }, []);
  const syncRoute = useCallback((game: Game) => {
    const route = navigationRef.getCurrentRoute();
    const params = route?.params as { gameId?: string; playerId?: string } | undefined;
    if (params?.gameId !== game.id || !params.playerId) return;
    const destination = gameDestination(game, params.playerId);
    if (destination === 'Home') {
      void clearActiveGame(game.id);
      navigationRef.reset({ index: 0, routes: [{ name: 'Home' }] });
    } else if (route?.name !== destination) {
      navigationRef.dispatch(StackActions.replace(destination, params));
    }
  }, []);
  const [fontsLoaded] = useFonts({
    Fraunces_700Bold,
    Fraunces_800ExtraBold,
    Fraunces_900Black,
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded) {
      await SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }} onLayout={onLayoutRootView}>
      <StatusBar style="light" />
      <SafeAreaProvider>
        <ErrorBoundary>
          <AuthGate>
            {activeGameId && <GameConnectionBanner gameId={activeGameId} onSync={syncRoute} onHome={() => {
              void clearActiveGame(activeGameId);
              navigationRef.reset({ index: 0, routes: [{ name: 'Home' }] });
            }} />}
            <NavigationContainer ref={navigationRef} linking={linking} onReady={trackRoute} onStateChange={trackRoute}>
              <AppNavigator />
            </NavigationContainer>
          </AuthGate>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
