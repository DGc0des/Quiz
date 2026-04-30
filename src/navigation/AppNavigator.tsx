import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { LinkingOptions } from '@react-navigation/native';
import { RootStackParamList } from '../types';
import { C } from '../theme';

import HomeScreen from '../screens/HomeScreen';
import CreateGameScreen from '../screens/CreateGameScreen';
import JoinGameScreen from '../screens/JoinGameScreen';
import LobbyScreen from '../screens/LobbyScreen';
import TurnRevealScreen from '../screens/TurnRevealScreen';
import TurnScreen from '../screens/TurnScreen';
import QuestionScreen from '../screens/QuestionScreen';
import ResultScreen from '../screens/ResultScreen';
import WinnerScreen from '../screens/WinnerScreen';
import LoserScreen from '../screens/LoserScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['quizapp://'],
  config: {
    screens: {
      JoinGame: 'join/:gameCode',
    },
  },
};

export default function AppNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: C.bg },
        animation: 'fade',
        animationDuration: 150,
        animationTypeForReplace: 'push',
        gestureEnabled: false,
      }}
    >
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen name="CreateGame" component={CreateGameScreen} />
      <Stack.Screen name="JoinGame" component={JoinGameScreen} />
      <Stack.Screen name="Lobby" component={LobbyScreen} />
      <Stack.Screen name="TurnReveal" component={TurnRevealScreen} />
      <Stack.Screen name="Turn" component={TurnScreen} />
      <Stack.Screen name="Question" component={QuestionScreen} />
      <Stack.Screen name="Result" component={ResultScreen} />
      <Stack.Screen name="Winner" component={WinnerScreen} />
      <Stack.Screen name="Loser" component={LoserScreen} />
    </Stack.Navigator>
  );
}
