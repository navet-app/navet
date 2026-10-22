---
title: Control climate devices
description: Read the climate overview and adjust thermostats, humidity, fans, and water heaters.
editUrl: https://github.com/navet-app/navet/edit/main/docs/how-to/everyday-control/climate.md
---

The Climate section collects your climate devices, summarizes current conditions, and shows
only the controls reported by each device.

![The current Climate dashboard grouped into room controls and environmental details.](/docs/how-to/everyday-control/climate-dashboard.webp)

## Read the overview

The summary strip puts exceptions first, followed by the current temperature range, active
heating or cooling, humidity, air quality, and unavailable-device counts when those readings exist.
Room control groups come next. Environmental sensor-only cards follow under **Humidity**, **Air
Quality**, or **Pressure** instead of being mixed into the control grid.

Available temperature, humidity, air quality, and pressure sensors appear automatically in Climate,
including humidity readings exposed by thermostats. Sensors you hide stay hidden.

## Adjust a thermostat

1. Open **Climate**.
2. Find the thermostat card. The large number is the current temperature; the smaller line shows
   its status and target temperature.
3. Use **−** or **+** on the card to adjust the target. The new target appears on the card as you
   change it.
4. Select the thermostat for more controls, including available HVAC modes and presets.

The side panel shows current temperature in the same text style as other entity values,
with the target and status in smaller text.
In the thermostat dialog, the large number between **−** and **+** is the target. The current
temperature and activity, such as **Idle** or **Heating**, stay visible beneath it, including
when the current and target temperatures match. Adjusting the target updates the requested
temperature; the current reading continues to show the room's measured temperature.

In the thermostat dialog, open **More actions** to edit the room or card name. Select **Controls**
for additional device controls, then **Back to controls** to return to the thermostat.

## Humidity and water devices

Humidifiers and dehumidifiers can expose a target humidity. Water heaters can expose temperature,
operation mode, or power when the provider supplies those capabilities.

## Fans

Supported fans can expose power, percentage, direction, oscillation, or presets. A fan with only a
power capability remains a simple control.

Select a fan card's settings button to open its controls. Use the power button to turn the fan
on or off. For fans with speed control, choose **Low**, **Medium**, or **High**, or drag the
speed slider and release to apply the change. Selecting a speed also turns the fan on.
Oscillation and direction controls appear when the device supports them.

Open the three-dot menu to **Edit room**, **Edit card name**, or **Customize** the card's tint
and icon. Select **Back to controls** to return, and **Done** when finished.

## If a control is absent

Check the device's supported controls and the [integration matrix](/integrations/), because
climate coverage varies by provider.
