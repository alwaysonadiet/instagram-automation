# Instagram Automation — v1 scope

Goal: a lightweight self-hosted ManyChat replacement for the features actually used on Instagram.

## Product principles
- Keep the UI simple and fast.
- Store detailed event data in the background, but keep the front-end uncluttered.
- Reuse the existing InstaAuto Instagram API, webhook, inbox and follow-check logic where possible.
- Do not modify or depend on the existing ManyChat account.

## v1 triggers
Trigger behaviour should feel as close to ManyChat as practical.

### Post / Reel comments
- Specific post/reel
- Multiple selected posts/reels
- All posts/reels
- Next post/reel
- Keywords are configured per trigger
- Any-comment option
- Public reply + private DM
- Different posts may use different keywords and different flows
- Multiple posts may share the same flow

### Story
- Story reply keyword
- Story reaction / emoji where supported
- Specific story or all stories where supported

### DM
- DM keyword trigger
- Multiple keywords per trigger

## Automation model
- Automation / Flow is separate from Trigger.
- One flow can have multiple triggers.
- One trigger points to one flow.
- A post/reel/story can have its own trigger settings and keywords.

## Flow steps
- Text message
- Media
- Multiple buttons
- URL button
- Postback / continue button
- Follow check gate
- Branch on follow result
- Delay where supported
- Future: visual canvas / map view
- Simple vertical editor should be the default UI

## Inbox
- Store incoming and outgoing messages
- Manual reply from dashboard
- Prioritise human/manual replies over automation noise
- Needs reply view
- Search conversations

## Data / Insights
Store enough data to analyse:
- trigger source
- media/post/story id
- keyword
- automation / flow
- DM sent success/failure
- follow check result
- button click
- human reply
- timestamps

Initial UI should stay simple:
- Traffic
- DM sent
- Follow passed
- Click
- Reply

## Versioning
- Keep previous message versions
- Allow restore
- Do not require users to leave disconnected blocks on a canvas just to preserve old copy

## v1 acceptance test
A real Instagram test must complete this full path:

1. Test Reel receives comment `TEST`
2. Public reply is posted
3. Private DM is sent
4. Follow gate checks real follow status
5. User follows if required
6. Follow status is re-checked
7. Message with buttons/link is delivered
8. User sends a normal DM reply
9. Reply appears in Inbox
10. Manual reply is sent from Inbox

After this passes, expand and polish the trigger UI.
