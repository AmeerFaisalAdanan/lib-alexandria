# Lessons & Architectural Directives — Library of Alexandria (lib-ax)

## Mobile-First Requirements & Standards

### 1. Mobile-First Design Hierarchy
* **Sequence**: `Mobile (360px–412px) → Tablet (768px) → Desktop (1440px)`
* **Primary Target Widths**: 360px, 375px, 390px, 412px.
* **Core Rule**: Mobile layout is the single source of truth. Responsive enhancement occurs upward for desktop. No forced horizontal scrolling.

### 2. Navigation Architecture
* **Mobile**: Bottom navigation bar (Icons + Labels: Home, Books, Settings) with clear active states, reachable with one hand, respecting safe-area insets (`env(safe-area-inset-bottom)`).
* **Desktop**: Progressively enhance into sidebar or expanded desktop navigation.

### 3. Dashboard Layout
* Focus on library summary ("What's in my library?"): Total Books, Collection Value (RM), Owner Breakdown cards, Recently Added list, sticky/primary `+ Add Book` action.
* No dense charts or desktop clutter on mobile views.

### 4. Book Browsing & Cards
* **Top Header**: Title + Search input + Filter trigger.
* **Filter Interaction**: Bottom sheet / drawer (not full-page redirect or cluttered top bar). Options: Owner, Genre, Location with Reset & Apply actions.
* **Book Cards**: Compact stacked cards (Title, Author, Genre, Owner, Location). Secondary details (publisher, price, purchase date, notes) strictly belong on Detail view. No dense tables on mobile.

### 5. Detail & Form Requirements
* **Book Detail**: Clean structured card view (Owner, Location, Publisher, Genre, Purchase Date, Price, Tags, Notes) with reachable action buttons (Edit, Move).
* **Add/Edit Forms**: Single-column layout, touch target >= 44x44px, numeric keyboard for price (`inputmode="decimal"` or `type="number"`), date picker, autocomplete/select dropdowns, sticky bottom submit bar to prevent keyboard obscuration.

### 6. Touch, Typography & Spacing
* **Touch Targets**: Minimum 44 × 44 px for all buttons, icons, filters, close triggers.
* **Typography**: Title (24–32px), Body (16px), Secondary (14px), Caption (min 12px).
* **Spacing**: Page gutters 16px / 20px / 24px with comfortable card padding.

### 7. Performance & Interaction
* Mobile-native patterns: Bottom sheets, drawers, segmented controls, sticky actions.
* No hover-dependent logic or tiny mouse dropdowns.
* Responsive verification viewports: 360×800, 375×812, 390×844, 412×915, 768×1024, 1440×900.
