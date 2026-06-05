import { useState, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useAlert } from '@/context/AlertToastContext';

export interface UseSpeechActivationProps {
  onWakeWordDetected: () => void;
}

export function useSpeechActivation({ onWakeWordDetected }: UseSpeechActivationProps) {
  const { showAlert } = useAlert();
  const [isListening, setIsListening] = useState(false);
  const [recognitionSupported, setRecognitionSupported] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    // Check for native browser speech recognition support (highly useful for Safari/Chrome on iOS/Android Web)
    const SpeechRecognition = 
      (globalThis as any).SpeechRecognition || 
      (globalThis as any).webkitSpeechRecognition || 
      (typeof window !== 'undefined' && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition));

    if (SpeechRecognition) {
      setRecognitionSupported(true);
      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = 'en-US';

      rec.onresult = (event: any) => {
        const lastResultIndex = event.results.length - 1;
        const transcript = event.results[lastResultIndex][0].transcript.toLowerCase();
        console.log(`[Speech Recognition Transcript]: "${transcript}"`);

        // Scan for safety trigger keywords
        const keywords = ['emergency', 'help me', 'save me', 'danger', 'police'];
        const matched = keywords.some(word => transcript.includes(word));
        
        if (matched) {
          console.log(`[Speech Match] Safety wake-word matched inside transcript!`);
          rec.stop();
          setIsListening(false);
          
          showAlert(
            'Voice SOS Activated',
            `Speech scanner matching keyword detected. Dispatching emergency broadcasts!`,
            [
              { text: 'Cancel SOS', style: 'cancel' },
              { text: 'Confirm Trigger', onPress: onWakeWordDetected }
            ]
          );
        }
      };

      rec.onerror = (event: any) => {
        console.warn('[Speech Recognition Error]:', event.error);
        if (event.error === 'not-allowed') {
          showAlert('Microphone Blocked', 'Voice recognition requires microphone permissions.');
          setIsListening(false);
        }
      };

      rec.onend = () => {
        // Automatically restart if it shut down but we intended to keep listening
        if (isListening && recognitionRef.current) {
          try {
            recognitionRef.current.start();
          } catch (e) {
            // silent catch
          }
        }
      };

      recognitionRef.current = rec;
    }
  }, [isListening]);

  const startListening = async () => {
    if (!recognitionSupported || !recognitionRef.current) {
      // Fallback for native wrapper simulators without web speech bindings
      setIsListening(true);
      console.log('[Speech Trigger Simulator] Listening...');
      showAlert(
        'Speech Recognition Active',
        'Speak close to the mic. (Simulating: matching "help me" in 10 seconds for demo...)',
        [{ text: 'Cancel', onPress: () => stopListening() }]
      );
      
      recognitionRef.current = setTimeout(() => {
        onWakeWordDetected();
        setIsListening(false);
      }, 10000);
      return;
    }

    try {
      setIsListening(true);
      recognitionRef.current.start();
      console.log('[Speech Recognition] Listening for wake-words: "emergency", "help me"...');
    } catch (error) {
      console.warn('[Speech Recognition Start Error]:', error);
    }
  };

  const stopListening = () => {
    setIsListening(false);
    if (!recognitionSupported) {
      if (recognitionRef.current) {
        clearTimeout(recognitionRef.current);
      }
      return;
    }
    
    try {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      console.log('[Speech Recognition] Stopped.');
    } catch (error) {
      console.warn('[Speech Recognition Stop Error]:', error);
    }
  };

  return {
    isListening,
    recognitionSupported,
    startListening,
    stopListening,
  };
}
