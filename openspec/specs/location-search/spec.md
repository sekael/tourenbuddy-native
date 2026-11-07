# location-search Specification

## Purpose
Lets users find a place by name while picking a map location, jump the map there, and keep the
place's name for the picked point instead of hunting for it by panning.

## Requirements

### Requirement: Search field in every location pick

While the location picker is active and the device is online, the map SHALL show a search field above the map content, docked at the bottom of the screen directly above the Cancel/Confirm actions, so it stays in thumb reach on phones and never covers the collapsed overlay header at the top. Results SHALL open from the field. It SHALL be available for every pick: tour goal, start point and end point, during tour creation and while editing a tour.

#### Scenario: Picking a tour goal

- **WHEN** the user starts adding a tour and the crosshair appears
- **THEN** a search field SHALL be visible at the bottom of the screen, above Cancel/Confirm
- **AND** the collapsed overlay header (e.g. "Tour goal") SHALL stay fully visible

#### Scenario: Typing with the on-screen keyboard

- **WHEN** the search field is focused on a touch screen
- **THEN** the field SHALL sit at the top of the visible area with the results below it, and Cancel/Confirm SHALL be hidden
- **AND** the layout SHALL stay so until the result list closes (a result is chosen, the map is touched, or Escape), even when the keyboard is dismissed first
- **AND** it SHALL NOT depend on the reported keyboard height, which iOS browsers report inconsistently
- **AND** the collapsed overlay of the pick (e.g. "Tour goal") SHALL be hidden meanwhile, without losing what was entered in it, and SHALL return when the search ends

#### Scenario: Searching with a mouse

- **WHEN** the search field is focused on a device with a hover-capable pointer
- **THEN** the field SHALL stay in the bottom dock above Cancel/Confirm, with results opening upward

#### Scenario: Picking a start point in edit mode

- **WHEN** the owner re-picks the start point of an existing tour
- **THEN** the same search field SHALL be visible

#### Scenario: Picker closed

- **WHEN** the picker is confirmed or cancelled
- **THEN** the search field and any result list SHALL disappear

### Requirement: Location search results

The search SHALL query Swiss place names, summits, huts, localities, postcodes and addresses once the trimmed input has at least 2 characters, after a short typing pause. Each result SHALL show its name as plain text plus its kind and region. Only the latest query's results SHALL be shown.

#### Scenario: Searching a summit

- **WHEN** the user types "Piz Bernina"
- **THEN** a result list SHALL show "Piz Bernina" with its kind (summit) and region

#### Scenario: Kinds are spelled properly in German

- **WHEN** the app language is German and the user searches "Chamanna da Tschierva"
- **THEN** the hut's kind SHALL read "Gebäude", not the service's transliterated "Gebaeude"
- **AND** a real "ue" ("Quelle") and the result names SHALL stay as the service spells them

#### Scenario: Input too short

- **WHEN** the trimmed input has fewer than 2 characters
- **THEN** no request SHALL be sent and no result list SHALL be shown

#### Scenario: Superseded query

- **WHEN** the user keeps typing while an earlier query is still in flight
- **THEN** the earlier query's results SHALL never replace the newer ones

#### Scenario: Duplicate names near the current view come first

- **WHEN** the map is zoomed in to at least regional level (zoom 9 or closer) near Leukerbad and the user searches "Schwarzhorn"
- **THEN** among results named "Schwarzhorn", the one nearest the map centre SHALL be listed first
- **AND** results with other names SHALL keep the search service's order
- **AND** no result SHALL be hidden because of the current view

#### Scenario: Overview keeps the service order

- **WHEN** the map is zoomed out further than regional level (below zoom 9)
- **THEN** results SHALL be listed in the search service's order

#### Scenario: Nearby duplicate beyond the first page

- **WHEN** more same-named places exist than the list shows
- **THEN** the nearest one SHALL still be listed, because ranking happens over a larger candidate set than the visible list (up to 30 candidates, 8 shown)

#### Scenario: Markup in source labels

- **WHEN** a result's source label contains HTML markup
- **THEN** it SHALL render as text only, never as markup

#### Scenario: No matches

- **WHEN** the query returns no results
- **THEN** the list SHALL show a localized "no places found" message

#### Scenario: Request fails

- **WHEN** the search request fails or times out
- **THEN** the list SHALL show a localized error message and the picker SHALL keep working

### Requirement: Choosing a result moves the crosshair onto it

Choosing a result SHALL move the map so the crosshair sits on the result's location at a zoom suited to the result kind, and SHALL close the result list. The picker SHALL stay open, so the user can still pan to adjust before confirming.

#### Scenario: Result chosen

- **WHEN** the user chooses "Piz Bernina"
- **THEN** the map SHALL move so the crosshair is on Piz Bernina
- **AND** the result list SHALL close and the Cancel/Continue actions SHALL stay available

#### Scenario: Map resizes while moving to the result

- **WHEN** the user chooses a result on a phone and the closing on-screen keyboard resizes the map while it moves
- **THEN** the map SHALL still come to rest with the crosshair on the result
- **AND** touching the map during the move SHALL leave the camera to the user

#### Scenario: The crosshair is the marker

- **WHEN** the user chooses a result
- **THEN** no additional pin SHALL be placed; the crosshair marks the location to be confirmed

#### Scenario: Re-picking with search keeps the current marker

- **WHEN** the user re-picks the goal of a draft or existing tour and chooses a search result
- **THEN** the current goal marker SHALL stay visible at its old position until the new pick is confirmed
- **AND** cancelling the pick SHALL leave it where it was

#### Scenario: Adjusting after a jump

- **WHEN** the user pans the map after choosing a result and then confirms
- **THEN** the confirmed location SHALL be the crosshair position, not the result's location

### Requirement: Search field interaction

The search field SHALL get out of the way of the map once the user acts on the map or a result: choosing a result, touching or panning the map, or pressing Escape SHALL close the result list and dismiss the on-screen keyboard. Enter SHALL choose the first result. Clearing the field SHALL also forget the last chosen result.

#### Scenario: Keyboard drops after choosing

- **WHEN** the user chooses a result on a phone
- **THEN** the result list SHALL close, the on-screen keyboard SHALL be dismissed, and the field SHALL keep the chosen name

#### Scenario: Touching the map

- **WHEN** the result list is open and the user touches or pans the map
- **THEN** the list SHALL close and the keyboard SHALL be dismissed without moving to any result

#### Scenario: Enter picks the first result

- **WHEN** results are listed and the user presses Enter
- **THEN** the first result SHALL be chosen as if tapped

#### Scenario: Escape closes the list only

- **WHEN** the result list is open and the user presses Escape
- **THEN** the list SHALL close and the picker SHALL stay open

#### Scenario: Clearing forgets the chosen result

- **WHEN** the user chooses a result, clears the field, and confirms without a new choice
- **THEN** the name SHALL come from the nearby-name lookup

### Requirement: Search result names the picked point

When the user confirms within 50 m of the last chosen result, that result's name SHALL be used as the suggested name of the picked point (the tour name for a goal, the start or end point name otherwise) instead of the nearby-name lookup. A confirm while the map is still flying to the chosen result, before the user touched the map, SHALL pick the result itself: its location and its name. Elevation lookup SHALL run unchanged.

#### Scenario: Confirm on the result

- **WHEN** the user chooses "Piz Bernina" and confirms without panning
- **THEN** the tour creation form SHALL be prefilled with the name "Piz Bernina"

#### Scenario: Confirm after moving away

- **WHEN** the user chooses a result, pans more than 50 m away, then confirms
- **THEN** the name SHALL come from the existing nearby-name lookup

#### Scenario: Start point from search

- **WHEN** the user picks a start point by choosing the result "Pontresina" and confirms without panning
- **THEN** the start point name SHALL be "Pontresina"

#### Scenario: Confirm before the flight lands

- **WHEN** the user chooses a landing 165 km away and confirms while the map is still flying there
- **THEN** the landing SHALL be the result's location with the result's name, not a place passed en route

### Requirement: Re-picking keeps a name the user typed

During tour creation, a goal re-pick SHALL replace the tour name with the new suggestion only while the name field is empty or still holds the last automatically filled name. A name the user typed SHALL be kept.

#### Scenario: User typed their own name

- **WHEN** the user types "Bernina Traverse", re-picks the goal and chooses the result "Piz Bernina"
- **THEN** the tour name SHALL remain "Bernina Traverse"

#### Scenario: Name still auto-filled

- **WHEN** the name field still holds the previous suggestion and the user re-picks the goal onto "Piz Palü"
- **THEN** the tour name SHALL become "Piz Palü"

### Requirement: Search is unavailable offline

The search field SHALL be hidden while the device is offline; location picking by panning SHALL keep working.

#### Scenario: Going offline while picking

- **WHEN** the device goes offline while the picker is open
- **THEN** the search field and any result list SHALL be hidden
- **AND** the crosshair and Cancel/Continue actions SHALL remain usable

### Requirement: The search knows what is being picked

The picker SHALL pass what it picks (goal, start or end) to the search. For a start or end
point the search SHALL also find public-transport stops and SHALL list access places (stops,
stations, villages, huts and other buildings, addresses) before terrain (glaciers, ridges), also
among same-named places. A goal search SHALL keep the service order. Ranking SHALL never hide a
result.

#### Scenario: Start at the trailhead, not on the glacier

- **WHEN** the user picks a start near the Sustenhorn and searches "Steingletscher"
- **THEN** the hamlet Steingletscher and the bus stop "Steingletscher, Susten" SHALL be listed
  before the Steingletscher glacier

#### Scenario: Goal search unchanged

- **WHEN** the user picks a goal and searches "Steingletscher"
- **THEN** no stop SHALL be requested and the results SHALL keep the service's order with the
  nearest-first rule for same-named places

#### Scenario: A stop and a same-named place at one spot

- **WHEN** a stop and a gazetteer place share a name and lie within 150 m of each other
- **THEN** only one of them SHALL be listed

#### Scenario: Stops show their kind

- **WHEN** a stop is listed
- **THEN** its kind SHALL read as a localized "Public transport stop"

#### Scenario: The stop search fails

- **WHEN** the stop request fails while the place search succeeds
- **THEN** the place results SHALL still be shown without an error
