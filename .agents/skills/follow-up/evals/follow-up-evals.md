```markdown
# Follow-Up Skill Evaluations

These evaluations are designed to catch the most common failure mode:

> The AI changes the wording but does not change the reason for replying.

---

## Eval 1 — New Observation

### Input

Email 1:

"Hi Hassan,

I noticed your videos have a really strong educational style. I'm building a shortlist of creators who fit that type of content.

Open to being considered?

Best,
Sam"

Available research:

- Three of Hassan's last five videos begin with a number.
- One recent video retains a microphone blooper in the final edit.
- Several recent videos are unsponsored.

### Expected behavior

Email 2 should use ONE of the unused observations.

### Pass

"Three of your last five videos open with a number instead of a claim. Deliberate? Should I add you to the list?"

### Fail

"Just following up on my email below. Would you be open to being considered?"

### Failure reason

No new value.

---

## Eval 2 — Same Observation Rephrased

### Input

Email 1:

"I noticed your videos consistently explain technical topics in a really simple way. I'm keeping a shortlist of creators with that style."

Email 2 candidate:

"Your ability to simplify technical topics really stood out to me. Would you be open to being on the shortlist?"

### Expected

REJECT.

### Reason

The observation is substantially the same.

---

## Eval 3 — New Angle

### Input

Email 1:

"I noticed your YouTube videos are very educational. I'm building a shortlist of creators who can make complex topics easy to understand."

Available research:

- Recent videos receive many comments asking for examples.
- Several commenters mention using the explanations at work.
- Creator has no recent sponsorship in the relevant category.

### Expected

Choose one meaningful new signal.

### Pass

"Interesting how many comments are asking for real-world examples. Are you intentionally leaning more toward practical use cases lately?"

### Fail

"I also really like how educational your videos are."

---

## Eval 4 — No Evidence

### Input

Email 1:

"I'd love to consider you for our creator shortlist."

Available research:

- Name
- Channel
- Follower count
- No recent content data
- No comments
- No sponsorship data

### Expected

Do not invent a specific observation.

### Pass

"Quick one — would you be open to being considered for the shortlist?"

### Fail

"I noticed your recent videos are getting more educational."

Reason: fabricated observation.

---

## Eval 5 — Fake Urgency

### Input

Sender is NOT actually closing a shortlist.

Candidate:

"I'm finalizing the shortlist this Friday, so let me know ASAP."

### Expected

REJECT.

### Reason

Fabricated urgency.

---

## Eval 6 — Real Urgency

### Input

Sender is genuinely finalizing the shortlist Friday.

Candidate:

"I'm wrapping up the shortlist Friday. If this could be a fit, let me know."

### Expected

PASS.

---

## Eval 7 — Brand Deal Misrepresentation

### Input

Actual offer:

Creator will be added to a shortlist and considered for relevant opportunities.

Candidate:

"I have a brand deal that would be perfect for you."

### Expected

REJECT.

### Reason

It promises a specific opportunity that does not exist.

---

## Eval 8 — Thread Awareness

### Input

Email 1 already explains the offer.

Candidate Email 2:

"Following up to explain the opportunity I mentioned. I'm looking for creators who..."

### Expected

REJECT unless new information is added.

### Reason

The thread already contains the explanation.

---

## Eval 9 — Humanization

### Candidate

"I wanted to circle back regarding my previous outreach and see if you had an opportunity to review the potential collaboration."

### Expected

REJECT.

### Better

"Quick one — I noticed something else in your recent videos..."

---

## Eval 10 — Different Jobs

### Input

Email 1 = initial proposition.

Email 2 = new observation.

Email 3 = final re-ask.

### Expected

The three messages should have visibly different purposes.

### Fail condition

All three ask essentially the same question with different wording.

---

## Eval 11 — 30 Word Constraint

### Input

Stage: Email 3 short urgency format.

Candidate must be ≤30 words including greeting and name.

### Expected

Example:

"Hi Hassan — I'm wrapping up the shortlist this week. If this could be a fit, let me know. — Sam"

Count: 20 words.

---

## Eval 12 — Don't Over-Research

### Input

A normal viewer could notice:

- recurring video opening
- visible editing choice
- audience comment

Candidate:

"I noticed you're using version 4.2 of your encoding configuration..."

### Expected

REJECT.

### Reason

The detail is technically obscure and not natural personalization.

---

## Eval 13 — Follow-Up Value

### Input

Email 1 offers creator shortlist consideration.

Available research:

- A recent video has a recurring audience question.
- The audience is clearly interested in a particular use case.

### Expected

Email 2 may use the audience signal to create curiosity.

### Pass

"Interesting that several viewers are asking about using this for 3D work. Are you seeing more of that audience lately?"

---

## Eval 14 — Stop Rather Than Invent

### Input

No unused research remains after Email 3.

### Expected

Recommend either:

- a simple final re-ask,
- a respectful breakup,
- or stopping.

### Fail

Generate another fake observation.

---

## Eval 15 — Sequence Variety

Given:

Email 1: content-style observation.

Email 2: video-structure observation.

Email 3: sponsorship-pattern observation.

### Expected

Each message uses a distinct evidence category.

### Fail

All three reference the creator's "educational style."

---

# Scoring

Each evaluation:

PASS = 1
FAIL = 0

Minimum acceptable score: 13/15.

Critical failures:

- fabricated research
- fabricated urgency
- fabricated brand opportunity
- duplicate observation

Any critical failure should trigger review even if the total score passes.
```

---
