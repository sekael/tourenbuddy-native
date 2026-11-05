import { NativeTabs } from 'expo-router/native-tabs';

import { TourActionBar } from '@/spike/tour-action-bar';

// S1: system glass tab bar floating over the map, plus a bottom accessory
// standing in for today's tour-action-bar.
export default function RootLayout() {
  return (
    <NativeTabs>
      <NativeTabs.BottomAccessory>
        <TourActionBar />
      </NativeTabs.BottomAccessory>
      <NativeTabs.Trigger name="(map)">
        <NativeTabs.Trigger.Label>Map</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="map" md="map" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="calendar">
        <NativeTabs.Trigger.Label>Calendar</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="calendar" md="calendar_month" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
