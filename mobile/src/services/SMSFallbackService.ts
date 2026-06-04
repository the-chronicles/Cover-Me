import { Linking, Platform } from 'react-native';

export interface SMSMessageConfig {
  contacts: string[];
  latitude: number | null;
  longitude: number | null;
  batteryLevel?: number;
  triggerSource: string;
  journeyDetails?: {
    destination: string;
    licensePlate?: string;
  };
}

export const SMSFallbackService = {
  /**
   * Formats a premium safety message containing location, battery status, and metadata
   */
  formatEmergencyMessage(config: SMSMessageConfig): string {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const coordinates = config.latitude && config.longitude 
      ? `${config.latitude.toFixed(5)},${config.longitude.toFixed(5)}`
      : 'Location Unavailable';
      
    const mapUrl = config.latitude && config.longitude
      ? `https://maps.google.com/?q=${coordinates}`
      : '';

    let message = `EMERGENCY! I need assistance. Triggered via ${config.triggerSource} SOS at ${time}.\n`;
    if (mapUrl) {
      message += `My Location: ${mapUrl}\n`;
    }
    if (config.batteryLevel !== undefined) {
      message += `Battery: ${Math.round(config.batteryLevel * 100)}%\n`;
    }
    if (config.journeyDetails) {
      message += `Journey to: ${config.journeyDetails.destination}\n`;
      if (config.journeyDetails.licensePlate) {
        message += `Vehicle Plate: ${config.journeyDetails.licensePlate}\n`;
      }
    }
    message += `Slogan: never walk alone.`;
    return message;
  },

  /**
   * Triggers the OS native SMS client pre-populated with emergency text and contacts list
   */
  async sendOfflineSMS(config: SMSMessageConfig): Promise<boolean> {
    const text = this.formatEmergencyMessage(config);
    const recipientList = config.contacts.join(',');

    // SMS URL scheme differs slightly between iOS and Android
    // iOS: sms:123,456&body=message
    // Android: sms:123,456?body=message
    const separator = Platform.OS === 'ios' ? '&' : '?';
    const smsUrl = `sms:${recipientList}${separator}body=${encodeURIComponent(text)}`;

    try {
      const supported = await Linking.canOpenURL(smsUrl);
      if (supported) {
        await Linking.openURL(smsUrl);
        return true;
      } else {
        console.warn('SMS URL scheme not supported on this platform');
        // Fallback for devices that don't support custom SMS lists
        const genericSmsUrl = `sms:?body=${encodeURIComponent(text)}`;
        await Linking.openURL(genericSmsUrl);
        return true;
      }
    } catch (error) {
      console.error('Failed to launch native SMS composer:', error);
      return false;
    }
  },

  /**
   * Triggers the WhatsApp application on the device with a pre-filled emergency template
   */
  async sendOfflineWhatsApp(config: SMSMessageConfig): Promise<boolean> {
    const text = this.formatEmergencyMessage(config);
    const waUrl = `whatsapp://send?text=${encodeURIComponent(text)}`;
    const universalWaUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;

    try {
      const supported = await Linking.canOpenURL(waUrl);
      if (supported) {
        await Linking.openURL(waUrl);
        return true;
      } else {
        await Linking.openURL(universalWaUrl);
        return true;
      }
    } catch (error) {
      console.error('Failed to launch WhatsApp composer:', error);
      return false;
    }
  }
};
