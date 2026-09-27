# Demo script

About 4 minutes. The point is to show Handy connecting real people, so each person gets their own screen:

| Screen | Who's on it | Link | Log in as |
| --- | --- | --- | --- |
| Phone 1 | Margaret, the customer | https://handycustomer-production.up.railway.app | `margaret@handy.demo` |
| Phone 2 | James, the worker | https://handyworker-production.up.railway.app | `james@handy.demo` |
| Laptop, tab 1 | Susan, Margaret's daughter | https://handycustomer-production.up.railway.app | `susan@handy.demo` |
| Laptop, tab 2 | The Handy team | https://handy-production-8846.up.railway.app | `admin@handy.demo` |

Password for all of them is `password123`. Susan and Margaret use the same app, so put Susan in a different browser (or a private window) on the laptop.

Two people run it: one holds Margaret's phone and talks, the other plays James.

## Before judging

- [ ] Open `https://handyapi-production.up.railway.app/health` a few minutes early. It should say `{"ok":true,...}`
- [ ] On the admin dashboard, click **Reset demo data** so everything starts clean
- [ ] Log into all four screens, and refresh them after the reset
- [ ] Both phones: brightness up, ringer off, zoomed so judges can read them
- [ ] James's phone is on **Find Jobs** and says "Taking jobs"

## The demo

**1. The problem (15 seconds, before touching anything)**

> A lot of older adults need small bits of help: moving something heavy, a ride, groceries. Apps for that are full of forms and categories. With Handy you just say what you need, and we connect you with someone nearby.

**2. Margaret asks for help** (Phone 1)

Type, or tap the mic and say:

> I need help moving a couch from my garage into the living room tomorrow at 2pm at my house

The AI takes about 5 seconds. While it thinks: *"There's no form and no category to pick. The AI figures out it's moving help, the day, the time, and that 'my house' means her address on file."*

When it asks to confirm, say *"Yes, that's right"*. That reply takes 10 to 15 seconds, then the summary card shows up.

**3. She sees the price and agrees to it** (Phone 1)

Point at the card: what, when, where, and the **Cost** section ($35 for moving help plus the $5 Handy fee, $40 total). Tap **15%** in the tip box and the total becomes $46. *"Before anything is sent, she sees exactly what she'll pay, tip included, and she has to agree to it. All of the tip goes to her helper."* Tick the box, then tap **Confirm Request**.

**4. James gets the job** (Phone 2)

The offer pops up on James's phone right away, with what he'll earn. Tap **View Job**: *"James sees what she needs, roughly where, and exactly what he'll make, $35 plus her $6 tip, before he says yes. He doesn't see her address until he accepts."* Tap **Accept for $41**.

Margaret's phone switches to the job page by itself.

**5. Her family knows too** (Laptop, Susan's tab)

Turn the laptop toward the judges. Margaret's job is on Susan's screen, with an alert that James will help her. *"Her daughter sees what's going on without having to call."*

**6. Staying safe** (both phones)

On Margaret's phone, point at the **arrival code**: *"When James gets to the door, she reads him this code. He can't mark himself arrived without it, so she knows it's really him."*

On James's phone, send her a message: *"Before I come over, can you send $40 on Venmo for supplies?"* A red warning shows up under it on Margaret's phone and on Susan's screen. *"Scams targeting seniors are a real problem. If a worker asks to be paid outside the app, we warn her and her family."*

**7. The job, live** (Phone 2, then Phone 1)

James taps **I'm On My Way**, then **I've Arrived** and types the code Margaret reads out, then **Start Job**, then **Complete Job**. Margaret's tracker moves with each tap, and Susan gets the arrived and finished alerts. *"That's all live, no refreshing."*

**8. Rate and book again** (Phone 1)

Give 5 stars and write a quick review, like *"James was careful with my couch and so kind."* James sees it on his phone. Tap **Read reviews of James** on his card: *"Other customers can read these before they book him."* On Margaret's phone, go to **My Services** and point at **Book James again**: *"Next time she can just ask for James, and he gets asked first."*

**9. Behind the scenes** (Laptop, admin tab, if there's time)

Show the dashboard's live activity feed, which logged everything that just happened. Open **Requests** and click **See matches** on the couch job: *"This is how we picked James: qualified, available, close by, and highly rated."*

**10. Emergencies** (Phone 1, if there's time)

Go to **Get Help** and type *"I fell and I can't get up"*. The emergency card with a **Call 911** button shows up right away, and Susan gets an alert. *"Emergencies never go to a worker. We catch them before the AI even sees the message, and her family is told."*

## Between judges

On the admin dashboard, click **Reset demo data**, then refresh the other three screens. Nobody gets logged out.

## If something goes wrong

| Problem | Fix |
| --- | --- |
| The AI is slow or not answering | Keep talking. After 45 seconds the backend answers with its built-in assistant, which handles the couch example fine |
| James never gets the offer | Check James's phone says "Taking jobs" and not "Off" |
| A screen looks stuck | Refresh it. Everything's saved on the backend |
| "Can't reach the server" | Open the `/health` link above. If it doesn't load, check the API on Railway |
| Everything's weird | Reset demo data, then refresh all four screens |

## Questions judges might ask

- **How does matching work?** Hard filters first (right skills, verified, in range, free at that time, not double-booked), then a score: 30% qualification, 25% availability, 20% distance, 15% rating, 10% experience. Urgent jobs weigh distance more. People who helped her before and got a good rating get a boost.
- **How does pricing work?** Each kind of help has a set price, plus $10 if it's urgent. Handy adds a $5 fee. The customer agrees to the total before anything is sent, and the worker sees their share before accepting.
- **What if the AI gets something wrong?** She sees a summary card and has to confirm before anything is sent. She can tap Edit and fix it by talking.
- **Privacy?** Workers only see the general area until they accept, then the full address. Nobody's phone number is shared. Chat stays in the app.
- **What if nobody accepts?** It asks more people every couple of minutes. If the time passes with nobody, it tells her and suggests another time.
- **How do workers get approved?** New workers sign up, pick their skills and hours, and can't get jobs until the Handy team verifies them on the admin dashboard.
- **Can family help?** Yes. She gives a family member an invite code (Settings, Invite a Family Member). They see her jobs and get alerts for arrivals, emergencies, and scam warnings.
- **Payments?** Faked for the hackathon. The price flow is real; the charge isn't.
