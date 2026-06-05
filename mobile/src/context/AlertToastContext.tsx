import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  Pressable,
  Animated,
  Dimensions,
  Platform,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { useTheme } from '@/hooks/use-theme';
import { Ionicons } from '@expo/vector-icons';

// Types for Custom Alert Button
export interface AlertButton {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

// Types for Toast message
export type ToastType = 'success' | 'error' | 'info';

interface AlertState {
  visible: boolean;
  title: string;
  message?: string;
  buttons: AlertButton[];
}

interface ToastState {
  visible: boolean;
  message: string;
  type: ToastType;
}

interface AlertToastContextType {
  showAlert: (title: string, message?: string, buttons?: AlertButton[]) => void;
  showToast: (message: string, type?: ToastType) => void;
}

const AlertToastContext = createContext<AlertToastContextType | null>(null);

export function useAlert() {
  const context = useContext(AlertToastContext);
  if (!context) {
    // Return standard Alert/Console fallbacks if accessed outside the provider (defensive design)
    return {
      showAlert: (title: string, message?: string, buttons?: AlertButton[]) => {
        console.log(`[Alert Fallback] ${title}: ${message}`);
        if (buttons && buttons.length > 0) {
          // Trigger first button as a fallback
          buttons[0].onPress?.();
        }
      },
      showToast: (message: string, type: ToastType = 'info') => {
        console.log(`[Toast Fallback] (${type.toUpperCase()}): ${message}`);
      },
    };
  }
  return context;
}

export function AlertToastProvider({ children }: { children: React.ReactNode }) {
  const theme = useTheme();

  // Alert State
  const [alertState, setAlertState] = useState<AlertState>({
    visible: false,
    title: '',
    message: '',
    buttons: [],
  });

  // Toast State
  const [toastState, setToastState] = useState<ToastState>({
    visible: false,
    message: '',
    type: 'info',
  });

  // Animations
  const toastY = useRef(new Animated.Value(-120)).current;
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const alertScale = useRef(new Animated.Value(0.9)).current;
  const alertOpacity = useRef(new Animated.Value(0)).current;
  
  const toastTimeoutRef = useRef<any>(null);

  // Trigger alert modal show/hide animations
  useEffect(() => {
    if (alertState.visible) {
      Animated.parallel([
        Animated.timing(alertOpacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.spring(alertScale, {
          toValue: 1,
          friction: 8,
          tension: 50,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(alertOpacity, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(alertScale, {
          toValue: 0.9,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [alertState.visible]);

  // Show customized alert dialog
  const showAlert = (title: string, message?: string, buttons?: AlertButton[]) => {
    const defaultButtons: AlertButton[] = buttons || [{ text: 'OK' }];
    setAlertState({
      visible: true,
      title,
      message,
      buttons: defaultButtons,
    });
  };

  // Show customized Toast notification (auto-dismisses after 3.2s)
  const showToast = (message: string, type: ToastType = 'info') => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }

    setToastState({
      visible: true,
      message,
      type,
    });

    // Animate In
    Animated.parallel([
      Animated.timing(toastOpacity, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.spring(toastY, {
        toValue: Platform.OS === 'ios' ? 10 : 25,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();

    // Auto dismiss
    toastTimeoutRef.current = setTimeout(() => {
      dismissToast();
    }, 3200);
  };

  const dismissToast = () => {
    Animated.parallel([
      Animated.timing(toastOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(toastY, {
        toValue: -120,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setToastState((prev) => ({ ...prev, visible: false }));
    });
  };

  const dismissAlert = () => {
    setAlertState((prev) => ({ ...prev, visible: false }));
  };

  // Renders the icon for Toast
  const renderToastIcon = () => {
    switch (toastState.type) {
      case 'success':
        return <Ionicons name="checkmark-circle" size={22} color="#10B981" />;
      case 'error':
        return <Ionicons name="warning" size={22} color="#EF4444" />;
      case 'info':
      default:
        return <Ionicons name="information-circle" size={22} color="#2563EB" />;
    }
  };

  // Helper to determine Toast theme border/accent colors
  const getToastAccentColor = () => {
    switch (toastState.type) {
      case 'success':
        return '#10B981';
      case 'error':
        return '#EF4444';
      case 'info':
      default:
        return '#2563EB';
    }
  };

  return (
    <AlertToastContext.Provider value={{ showAlert, showToast }}>
      {children}

      {/* Floating Animated Toast Container */}
      {toastState.visible && (
        <Animated.View
          style={[
            styles.toastContainer,
            {
              transform: [{ translateY: toastY }],
              opacity: toastOpacity,
              backgroundColor: theme.backgroundElement,
              borderColor: getToastAccentColor(),
              shadowColor: getToastAccentColor(),
            },
          ]}
        >
          <Pressable onPress={dismissToast} style={styles.toastContent}>
            <View style={styles.toastIconWrapper}>{renderToastIcon()}</View>
            <Text style={[styles.toastText, { color: theme.text }]}>
              {toastState.message}
            </Text>
          </Pressable>
        </Animated.View>
      )}

      {/* Customizable Alert Modal */}
      <Modal
        visible={alertState.visible}
        transparent={true}
        animationType="none"
        onRequestClose={dismissAlert}
      >
        <Animated.View 
          style={[
            styles.modalBackdrop, 
            { opacity: alertOpacity }
          ]}
        >
          <Pressable style={styles.absolutePressable} onPress={() => {
            // Dismiss if click backdrop and only has 1 action button
            if (alertState.buttons.length <= 1) dismissAlert();
          }} />
          
          <Animated.View
            style={[
              styles.alertCard,
              {
                transform: [{ scale: alertScale }],
                backgroundColor: theme.backgroundElement,
                borderColor: theme.backgroundSelected,
                borderWidth: 1,
              },
            ]}
          >
            <View style={styles.alertHeader}>
              <Text style={[styles.alertTitle, { color: theme.text }]}>
                {alertState.title}
              </Text>
              {alertState.message && (
                <Text style={[styles.alertMessage, { color: theme.textSecondary }]}>
                  {alertState.message}
                </Text>
              )}
            </View>

            {/* Buttons list layout */}
            <View
              style={[
                styles.buttonsContainer,
                alertState.buttons.length === 2 ? styles.buttonsRow : styles.buttonsColumn,
              ]}
            >
              {alertState.buttons.map((btn, index) => {
                let textStyle: any = styles.buttonText;
                let btnStyle: any = styles.button;

                if (btn.style === 'cancel') {
                  textStyle = [styles.buttonTextCancel, { color: theme.textSecondary }];
                  btnStyle = [styles.buttonCancel, { backgroundColor: theme.backgroundSelected }];
                } else if (btn.style === 'destructive') {
                  textStyle = styles.buttonTextDestructive;
                  btnStyle = styles.buttonDestructive;
                } else {
                  textStyle = styles.buttonTextDefault;
                  btnStyle = styles.buttonDefault;
                }

                return (
                  <Pressable
                    key={index}
                    style={({ pressed }) => [
                      btnStyle,
                      pressed && styles.buttonPressed,
                      alertState.buttons.length === 2 ? { flex: 1 } : null,
                    ]}
                    onPress={() => {
                      dismissAlert();
                      // Timeout to ensure modal closes before running actions (preventing overlay freezing)
                      setTimeout(() => {
                        btn.onPress?.();
                      }, 50);
                    }}
                  >
                    <Text style={textStyle}>{btn.text}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Animated.View>
        </Animated.View>
      </Modal>
    </AlertToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  // Toast Styling
  toastContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 44 : 20,
    left: 20,
    right: 20,
    borderRadius: 16,
    borderWidth: 1.5,
    paddingVertical: 14,
    paddingHorizontal: 16,
    zIndex: 9999,
    elevation: 10,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
  },
  toastContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  toastIconWrapper: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiIcon: {
    fontSize: 18,
  },
  toastText: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
    lineHeight: 18,
  },

  // Alert Modal Styling
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)', // Sleek darkened backing overlay
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  absolutePressable: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  alertCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 24,
    padding: 24,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 8,
  },
  alertHeader: {
    alignItems: 'center',
    marginBottom: 24,
    gap: 8,
  },
  alertTitle: {
    fontSize: 19,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  alertMessage: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  buttonsContainer: {
    gap: 10,
  },
  buttonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  buttonsColumn: {
    flexDirection: 'column',
  },
  button: {
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  buttonDefault: {
    backgroundColor: '#2563EB', // Vivid Blue
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonCancel: {
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDestructive: {
    backgroundColor: '#EF4444', // Vivid Red
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  buttonTextDefault: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '700',
  },
  buttonTextCancel: {
    fontSize: 15,
    fontWeight: '600',
  },
  buttonTextDestructive: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '700',
  },
});
