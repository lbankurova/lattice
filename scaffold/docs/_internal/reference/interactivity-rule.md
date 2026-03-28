# Interactivity Rule

**Every interactive-looking UI element must produce a visible result when activated.**

This is a hard rule, not a guideline. If something looks clickable, it must respond. If something has a hover state, clicking it must do something. Dead clicks erode user trust and make the application feel broken.

## What counts as "interactive-looking"

- Buttons (any styled clickable element)
- Links (underlined or colored text)
- Table rows with hover highlight
- Dropdown selects
- Checkboxes and radio buttons
- Filter chips/pills
- Tab buttons
- Accordion/expandable headers
- Icons that imply action (chevrons, close buttons, edit icons)
- Chart elements with hover tooltips (bars, points, segments)

## What counts as "visible result"

- Navigation (route change, scroll to section, panel switch)
- Data filtering (table updates, chart redraws)
- Selection state change (highlighted row, active tab)
- Panel open/close (context panel, accordion, dropdown)
- Form state change (checkbox toggles, input accepts text)
- Feedback (toast notification, status change, loading indicator)

## Implementation rules

1. **If you can't build the real action yet, build a stub.** A toast saying "Export coming soon" is better than a dead button.
2. **Empty states are mandatory.** When a filter produces zero results, show "No results" — don't show a blank panel.
3. **Loading states are mandatory.** When data is being fetched, show a loading indicator — don't show stale data or blank space.
4. **Error states are mandatory.** When a request fails, show the error — don't silently fail.
5. **Chart legends filter.** Every legend shown on a chart must toggle the corresponding series on click. A legend that doesn't filter is a dead UI element.
6. **Context menu items work.** If a right-click menu appears, every item in it must do something.

## Testing

During `/review`, the audit checklist checks interactivity. Any element that looks interactive but produces no result is a FAIL.
