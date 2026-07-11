# campaign surfaces (`app/campaigns/_components`) — campaign surfaces

Campaign surfaces (UNN-329), rendered by app/campaigns/ + app/campaigns/[shortId]/:

- **My Campaigns** cards + create dialog.
- **Manage page** (DM): invite-link card (copy/regenerate), roster (+ remove player), encounter list + create dialog, and live-encounter banner.
- **Character-placement section** (UNN-328, owner): a card grid of the viewer's characters placed here + an "Add character" combobox dialog (place/move, with consent + single-campaign move confirmation) and a per-card remove (unplace) control — all setting `characters.campaignId` via `setCharacterCampaignAction`.
- **Lifecycle controls** (UNN-330): a member's "Leave campaign" button and the DM's type-to-confirm "Delete campaign" button.
