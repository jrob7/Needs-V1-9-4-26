// utils/appointmentReminders.js
// setNotificationHandler is intentionally NOT called here — it must live at
// the top of App.js so Expo registers it before any notification can fire.
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const REMINDER_MINS_BEFORE = 2;
const FOLLOWUP_MINS_AFTER  = 2;

// ── Request permission ────────────────────────────────────────────────────────
export async function requestNotificationPermissions() {
  if (Platform.OS === 'web') return false;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('appointment-reminders', {
      name: 'Appointment Reminders',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#2563EB',
    });
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;

  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

// ── Parse "Fri, Jul 10, 2026" + "11:00 AM" into a Date ───────────────────────
// Hermes (React Native's JS engine) does NOT reliably parse non-ISO date strings
// via new Date(string) — "Jul 10, 2026" returns Invalid Date. Parse manually.
const MONTH_IDX = {
  Jan:0, Feb:1, Mar:2, Apr:3, May:4,  Jun:5,
  Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11,
};

function parseAppointmentDateTime(dateStr, timeStr) {
  try {
    // Strip optional weekday prefix: "Fri, Jul 10, 2026" → "Jul 10, 2026"
    const cleanDate = (dateStr || '').replace(/^\w+,\s*/, '').trim();

    // Parse "Jul 10, 2026" manually to avoid Hermes new Date(string) issues
    const dp = cleanDate.match(/^(\w{3})\s+(\d{1,2}),?\s+(\d{4})$/);
    if (!dp || MONTH_IDX[dp[1]] === undefined) {
      return null;
    }

    // new Date(year, month, day) always uses LOCAL midnight — no UTC offset issues
    const base = new Date(parseInt(dp[3], 10), MONTH_IDX[dp[1]], parseInt(dp[2], 10));
    if (isNaN(base.getTime())) return null;

    if (timeStr) {
      // Strip any unicode whitespace (e.g. U+202F narrow no-break space that
      // iOS toLocaleTimeString inserts before AM/PM) before regex matching
      const t  = timeStr.trim().replace(/[^\S ]/g, ' ');
      const tp = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
      if (tp) {
        let h      = parseInt(tp[1], 10);
        const m    = parseInt(tp[2], 10);
        const ampm = (tp[3] || '').toUpperCase();
        if (ampm === 'PM' && h !== 12) h += 12;
        if (ampm === 'AM' && h === 12) h  = 0;
        base.setHours(h, m, 0, 0);
      }
    }

    return base;
  } catch {
    return null;
  }
}

// ── Cancel any existing reminder for an appointment ───────────────────────────
export async function cancelAppointmentReminder(appointmentId) {
  if (Platform.OS === 'web') return;
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of scheduled) {
      if (n.content?.data?.appointmentId === appointmentId) {
        await Notifications.cancelScheduledNotificationAsync(n.identifier);
      }
    }
  } catch (e) {
    console.log('cancelAppointmentReminder error:', e?.message);
  }
}

// ── Schedule the 2-hour before reminder ──────────────────────────────────────
export async function scheduleAppointmentReminder(appointment) {
  if (Platform.OS === 'web') return;
  const { _id: appointmentId, date, time, businessName } = appointment;
  if (!date) return;

  const apptDate = parseAppointmentDateTime(date, time);
  if (!apptDate || isNaN(apptDate.getTime())) {
    console.log('Reminder skipped — could not parse date:', date, time);
    return;
  }

  const triggerDate = new Date(apptDate.getTime() - REMINDER_MINS_BEFORE * 60 * 1000);
  const now         = new Date();
  if (triggerDate <= now) {
    console.log('Reminder skipped — trigger is in the past:', triggerDate.toLocaleString());
    return;
  }

  const granted = await requestNotificationPermissions();
  if (!granted) {
    console.log('Notification permission not granted');
    return;
  }

  await cancelAppointmentReminder(appointmentId);

  const timeLabel = time && time !== 'As Agreed' ? ` at ${time}` : '';
  const identifier = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Appointment Reminder',
      body:  `Your appointment with ${businessName || 'your service provider'}${timeLabel} is in ${REMINDER_MINS_BEFORE} minutes.`,
      data:  { appointmentId, type: 'appointmentReminder' },
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: triggerDate,
    },
  });

  console.log('Reminder scheduled:', triggerDate.toLocaleString(), '| id:', identifier);
  return identifier;
}

// ── Schedule the post-appointment follow-up (2 hrs AFTER) ─────────────────────
// Only called for the current user's role — do NOT schedule role:'business'
// from the customer's device.
export async function scheduleAppointmentFollowUp(appointment, role) {
  if (Platform.OS === 'web') return;
  const { _id: appointmentId, date, time, businessName, needText, serviceUserId, requesterId } = appointment;
  if (!date) return;

  const apptDate = parseAppointmentDateTime(date, time);
  if (!apptDate || isNaN(apptDate.getTime())) {
    console.log('Follow-up skipped — could not parse date:', date, time);
    return;
  }

  const triggerDate = new Date(apptDate.getTime() + FOLLOWUP_MINS_AFTER * 60 * 1000);
  const now         = new Date();
  if (triggerDate <= now) {
    console.log('Follow-up skipped — trigger is in the past');
    return;
  }

  const granted = await requestNotificationPermissions();
  if (!granted) return;

  const isRequester = role === 'requester';
  const identifier  = await Notifications.scheduleNotificationAsync({
    content: {
      title: isRequester ? 'Was your Need completed?' : 'Did you complete this job?',
      body:  isRequester
        ? `Let us know how your appointment with ${businessName || 'the provider'} went.`
        : `Was the job for "${(needText || 'this request').slice(0, 50)}" completed?`,
      data: {
        appointmentId,
        type:          'appointmentFollowUp',
        role,
        businessName:  businessName  || '',
        needText:      needText      || '',
        serviceUserId: serviceUserId || null,
        requesterId:   requesterId   || null,
      },
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: triggerDate,
    },
  });

  console.log('Follow-up (' + role + ') scheduled:', triggerDate.toLocaleString(), '| id:', identifier);
  return identifier;
}
