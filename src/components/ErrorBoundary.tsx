import { Component, ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { C, F } from '../theme';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  // Remounts the subtree on retry so the app restarts from the Home screen
  // with fresh navigation state instead of re-rendering the crashed screen.
  resetKey: number;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, resetKey: 0 };

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    if (__DEV__) console.error('ErrorBoundary caught:', error);
  }

  handleRetry = () => {
    this.setState((s) => ({ hasError: false, resetKey: s.resetKey + 1 }));
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={s.container}>
          <Text style={s.emoji}>😵</Text>
          <Text style={s.title}>Ωχ! Κάτι πήγε στραβά</Text>
          <Text style={s.subtitle}>
            Παρουσιάστηκε ένα απρόσμενο σφάλμα. Δοκιμάστε ξανά — θα επιστρέψετε στην αρχική
            οθόνη.
          </Text>
          <TouchableOpacity style={s.button} onPress={this.handleRetry} activeOpacity={0.85}>
            <Text style={s.buttonText}>Επιστροφή στην Αρχική</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return <View key={this.state.resetKey} style={s.fill}>{this.props.children}</View>;
  }
}

const s = StyleSheet.create({
  fill: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emoji: {
    fontSize: 56,
    marginBottom: 16,
  },
  title: {
    fontFamily: F.extraBold,
    fontSize: 24,
    color: C.ink,
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontFamily: F.sansMedium,
    fontSize: 15,
    color: C.inkSoft,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  button: {
    backgroundColor: C.primary,
    borderRadius: 999,
    paddingVertical: 16,
    paddingHorizontal: 36,
    shadowColor: C.primaryDark,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 6,
  },
  buttonText: {
    fontFamily: F.sansBold,
    fontSize: 16,
    color: C.primaryInk,
  },
});
