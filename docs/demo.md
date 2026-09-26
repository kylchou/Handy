# Demo script

About 3 minutes. One person drives the customer app and one person talks. The autopilot plays the worker, so you don't need a second phone.

## Before judging

- [ ] `.env` has `MODEL_API_KEY` set (the Muse key), or the chat falls back to the simpler built-in assistant
- [ ] Start the backend: `pnpm dev:api`. The log should say `Loaded @handy/ai`
- [ ] Start the customer app: `pnpm dev:customer`, and open http://localhost:3000 (or the hosted URLs if Arjun has them up)
- [ ] `pnpm demo reset` so everything starts clean
- [ ] `pnpm demo autopilot on 6` (a fake worker accepts and finishes jobs, 6 seconds per step)
- [ ] Log in as `margaret@handy.demo` / `password123`
- [ ] Phone or browser zoomed so judges can read it. Ringer off
- [ ] If it's hosted: open `/health` on the API a few minutes early to wake it up

`pnpm demo status` tells you if the API is up and the autopilot is on.

## The demo

**1. The problem (15 seconds, before touching anything)**

> A lot of older adults need small bits of help: moving something heavy, a ride, groceries. Apps for that are full of forms and categories. With Handy you just say what you need.

**2. Ask for help**

Type (or tap the mic and say):

> I need help moving a couch from my garage into the living room tomorrow at 2pm at my house

The AI takes about 10 seconds. While it thinks, say: *"There's no form and no category to pick. The AI figures out it's moving help, the day, the time, and that 'my house' means her address on file."*

When it asks to confirm, say *"Yes, that's right"*. The summary card shows up.

**3. Confirm**

Tap **Confirm Request**. Say: *"It goes to the best nearby workers who are qualified, verified, and free at that time. It weighs distance, rating, and experience."*

After about 6 seconds James accepts, and the screen switches by itself.

**4. The job page**

Point at:
- **James's card**: rating, jobs done, 2.4 miles away
- **The arrival code**: *"When James gets to the door, Margaret reads him this code. He can't mark himself arrived without it, so she knows it's really him."*

Type a message: *"The couch is the blue one by the door."*

**5. The scam warning**

In a terminal, run `pnpm demo scam`. James's next message asks to be paid on Venmo, and a red warning shows up under it. Say: *"Scams targeting seniors are a real problem. If a worker asks for Venmo, gift cards, or a card number, we flag it and warn her. Her family gets told too."*

**6. Live status**

The tracker moves by itself: on the way, arrived, working, done. Say: *"That's live, no refreshing."*

**7. Rate and book again**

Give 5 stars. Go to **My Services** and point at **Book James again**: *"Next time she can just ask for James, and he gets asked first."*

**8. Safety (if there's time)**

Go to **Get Help** and type *"I fell and I can't get up"*. The emergency card with a **Call 911** button shows up right away. Say: *"Emergencies never go to a worker. We catch them before the AI even sees the message, and her family is alerted."*

## Between judges

```
pnpm demo reset
```

Then refresh the customer app. Nobody gets logged out, and the autopilot stays on.

## If something goes wrong

| Problem | Fix |
| --- | --- |
| The AI is slow or not answering | Keep talking. After 45 seconds the backend answers with its built-in assistant, which handles the couch example fine |
| "Can't reach the server" | The API stopped. Run `pnpm dev:api` again, then `pnpm demo autopilot on 6` (the autopilot turns off when the API restarts) |
| Nobody accepts | `pnpm demo status`. The autopilot is probably off |
| The screen looks stuck | Refresh. Everything's saved on the backend |
| Everything's weird | `pnpm demo reset`, refresh, log in again |

## Questions judges might ask

- **How does matching work?** Hard filters first (right skills, verified, in range, free at that time, not double-booked), then a score: 30% qualification, 25% availability, 20% distance, 15% rating, 10% experience. Urgent jobs weigh distance more. People who helped her before and got a good rating get a boost.
- **What if the AI gets something wrong?** She sees a summary card and has to confirm before anything is sent. She can tap Edit and fix it by talking.
- **Privacy?** Workers only see the general area until they accept, then the full address. Nobody's phone number is shared. Chat is in the app.
- **What if nobody accepts?** It asks a few more people every couple of minutes. If the time passes with nobody, it tells her and suggests picking another time.
- **Can family help?** Yes. She gives a family member an invite code (Settings, Invite a Family Member). They see her jobs and get alerts for arrivals, emergencies, and scam warnings.
- **Payments?** Faked for the hackathon. The price is set by the type of job, with a small platform fee.
