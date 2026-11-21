---
title: The open-source community is wrong about AI
description: Should we care about software working, or the tools used to build it? If many in the FOSS community are to be believed, the latter. And everyone else is wrong.
pubDate: 2026-11-21
category: open-source
tags:
  - Open Source
  - AI
  - Linux
  - Software Engineering
cover: ./cover.webp
coverAlt: On the left, a group of dumb-looking cavemen stand in a cave, one wearing a “Zig” T-shirt; on the right, a group of AI giga-chads wearing “claude”/“chat gpt” branded T-shirts generate millions of lines of code, with one having dollar signs in his eyes. In the middle, a sensible-looking person holds their hands to their head, visibly frustrated at the two extremes.
share:
  linkedin: |-
    Eighteen kernel boots to find out which way to round a number.

    An Intel graphics driver left one Linux machine with a black screen. An AI assistant helped Linus Torvalds gather and analyse diagnostics, but repeatedly concluded the problem couldn't be solved. Torvalds kept at it. The fix made it into stable Linux.

    Now imagine getting an untested rewrite of the driver with ‘improves display reliability’ as the entire explanation. That's the patch to turn away. Ask contributors what broke, what they changed and how they checked it. It's a better use of everyone's time than investigating who pressed the keys.

    #OpenSource #Linux #AI #SoftwareEngineering
  x: 24 diagnostic patches, 18 kernel boots and a fix that rounds down instead of up. Reject the untested rewrite, not the good patch someone used AI to help write.
  bluesky: Torvalds's AI-assisted graphics fix took 18 kernel boots. The work was figuring out why the screen went black. That's what a contributor should have to explain, not who pressed the keys.
  threads: An AI assistant helped Linus Torvalds investigate a black screen, but repeatedly concluded the problem couldn't be solved. Torvalds kept at it, and the fix came down to rounding a number the other way. Give me that patch over an untested rewrite any day, even if someone typed the rewrite by hand.
  mastodon: |-
    One machine booted to a black screen. Linus Torvalds used AI to help investigate, and his Intel Xe fix made it into stable Linux after 24 diagnostic patches and 18 kernel boots. A contributor should be able to explain why the patch works. A maintainer shouldn't have to repeat the investigation to find out.

    #OpenSource #LinuxKernel #SoftwareEngineering
  facebook: A black screen, 18 kernel boots and a fix that came down to rounding the other way. AI helped Linus Torvalds debug it, but he still had to work out what broke. That's what I'd ask about before taking a patch.
---

In August, one Linux machine came up from a cold boot with a black screen where the desktop should have been. Linus Torvalds (yes, that one) used an AI assistant to help work out why. This made the open-source community pause; could it be that a hero of the community, which many would have assumed to be anti-AI, is actually pro-AI? Is that right?

The open-source community is wrong to turn away good work because AI helped produce it. I use [Claude Code and Codex](/blog/the-ai-bubble-isn-t-the). If I build something in my spare time, open-source it, solve a genuine problem, and ask nothing for it in return, perhaps you first reaction should be to assess whether the app is any good, rather than questioning me on which tools I used to build it.

## Vibe coding, slop and engineering

I think much of the problem with AI in open-source (and coding in general) is that there seems to be parties on both camps of the AI argument either seeing 'vibe coding' as the end of all good software, or the best thing since sliced bread. A distinction is needed. 

### So what is vibe coding?

Vibe coding is when I decide to re-decorate the house myself. I buy some paint, and a roller, put on some old clothes and get to it. Just because I have the tools, it does not mean I'm any good at it. Trust me, I've tried. The tools do not replace the training and experience that a professional has.

### An alternative: AI-assisted Engineering

Now I hire a professional decorator to fix my mess. He learned from his dad - doing it the old fashioned way with buckets of paint and brushes. But, things have changed and he's kept up. He now uses specialised paint, different-sized rollers, and laser guides to make sure the job is neat. All of these tools are also available to me - but only a professional can use them properly and get a good result. 

### But, we don't make that distinction

[Zig's ‘Strict No LLM / No AI Policy’](https://ziglang.org/code-of-conduct/) is having none of that distinction. In its Codeberg organisation, Libera.chat channel and development Zulip, the project bans generated code and prose, AI editing and translation, sharing the results of AI brainstorming even in your own words, and using LLMs to find bugs. Zig gets to set the rules for those spaces. A rule that disqualifies the investigation before you've even seen the patch is a daft rule.

Back to the black screen. In [the Intel Xe commit](https://kernel.googlesource.com/pub/scm/linux/kernel/git/torvalds/linux.git/+/818bebeb63dd6bf5f4e07e145f6cdbace520a34c), Torvalds says an unnamed assistant helped him add diagnostic code to the graphics driver and make sense of what came back. It also drafted the main explanation in the commit. 

## The objections

So called 'purists' within the open-source community may indeed distinguish between vibe-coding and AI-assisted engineering - but still berate (**very loudly**) any use of AI. 

Here are their arguments, and why they're wrong.

### Rights and openness

**1. AI companies train on copyrighted open-source code without developers' consent.**

Did the company have permission to make copies when it collected the code and trained the model? Did the model's output reproduce protected code? As the [US Copyright Office's training report](https://www.copyright.gov/ai/Copyright-and-Artificial-Intelligence-Part-3-Generative-AI-Training-Report-Pre-Publication-Version.pdf) explains, those are separate questions. I can read a repository and learn how someone solved a problem without copying their implementation. When someone does copy protected code, the licence doesn't vanish because the copy came out of a chatbot. Calling the whole thing a glorified photocopier saves time, mostly by skipping both questions.

A guitarist can learn how to pick a string by listening to a record. Putting someone else's recording out under your own name is a rather different use of the record. The distinction is useful; it doesn't decide what copying was permitted during training.

**2. AI models are proprietary black boxes.**

If all I get is a box to type into on somebody else's website, then yes, that's a black box. Give me the code, the weights and enough information about how the model was trained, and I can study it, change it and run it without asking the company first. Working out why it produced one particular answer is harder. That's a good reason to do more work on how we explain model outputs, not a reason to pretend there's no difference between getting the code and getting a login screen.

You can establish that a treatment works before you know exactly how it works. You do that by testing it and looking at the risks, not by admiring how confidently the leaflet is written. This happens in science all the time - countless discoveries are made in Physics, Chemistry and other fields for which we have no theoretical explanation - but we do know they work. 

**3. Corporations are profiting from decades of unpaid open-source work.**

[Companies are allowed to make money from open source](https://opensource.org/faq). They're not allowed to ignore the licence because complying would be a faff. AI makes it easier to reuse code at scale, so improve the tools for spotting suspect copies and enforce the licences when they're broken. If a tool finds a match, check it. A similarity score isn't a court judgment with fewer vowels.

You could reprint a photographer's work without asking long before copying a picture took a right-click. Getting better at finding unauthorised copies made more sense than confiscating the cameras.

### Who controls the tools

**4. AI needs so much computing power that only a few companies can control it.**

[Training the biggest models takes an enormous amount of computing power](https://hai.stanford.edu/assets/files/ai_index_report_2026_chapter_1_research_development.pdf). Running a model that's useful for the job in front of you is a different matter. I want models that do useful work on ordinary hardware, better ways to run them and publicly funded research and shared computing for jobs that really do need bigger machines. Refusing to use AI won't conjure up a publicly owned data centre.

Computers used to take up whole rooms. There's one in your pocket now, which you can use for the excellent purpose of checking whether it's raining outside. AI doesn't have to follow that exact path for cheaper, more accessible computing to be worth pursuing.

**5. Using AI makes developers dependent on proprietary services.**

Then don't rely on a proprietary service. Open weights give you the numbers the model learnt during training; ‘runs locally’ tells you where the work happens. Neither tells you what you're allowed to do with it. The [Open Source Initiative's definition](https://opensource.org/ai/open-source-ai-definition) asks for the freedom to use, study, modify and share, with the weights, training and running code, and detailed information about the training data. [Ai2's Olmo 3 release](https://allenai.org/blog/olmo3) includes data, code and intermediate versions from training, not just the finished weights.

If you don't want to rely on Windows, you can run Linux. I rather like that nobody looked at Windows and decided we'd better not bother making another operating system.

**6. AI consumes power, threatens workers and makes surveillance easier.**

The [electricity bill is real](https://www.iea.org/reports/key-questions-on-energy-and-ai/executive-summary), people are entitled to decent working conditions, and [using AI to monitor staff](https://www.ilo.org/publications/ai-systems-work-changing-psychosocial-work-environment) deserves rather more scrutiny than a slide marked ‘responsible AI’. Make companies account for what they consume and how they treat people. Put enforceable limits on surveillance and ban particular uses where the harm warrants it. None of that requires throwing away a tool that helps someone fix a graphics driver.

Industrialisation brought pollution, dangerous work and lost livelihoods. [Factory protections](https://www.parliament.uk/about/living-heritage/transformingsociety/livinglearning/19thcentury/overview/factoryact/) had to be fought for and enforced. Workers needed safer conditions, better pay and a share of the gains, not a tour of the lovely new machinery.

### What maintainers have to review

**7. AI lets people flood projects with rubbish pull requests.**

Yes, it makes rubbish quicker to produce. Maintainers in the [Linux Foundation's 2026 survey](https://www.linuxfoundation.org/hubfs/Research%20Reports/Navigating-Open-Source-Software-Development-in-the-Generative-AI-Era.pdf) reported concerns about both the amount of work coming in and its quality. Imagine a different submission for the Xe black screen: an untested rewrite of the driver, no account of what failed, and ‘improves display reliability’ where the explanation ought to be. I wouldn't spend an evening reviewing that. Ask for a bug report someone can reproduce, a patch that addresses the fault and evidence that it was checked; put what you can check automatically at the door and close submissions that don't meet the standard.

Email made it easier to send useful messages - but also, absolute shite. We put in spam filters rather than making everybody go back to licking envelopes.

**8. AI leaves maintainers with more work per patch.**

Even if you get no extra patches, a plausible-looking change can take longer to review than it took to write. In Figure 1 of that Linux Foundation survey, 52% of responding maintainers said their average review time had gone up with AI-assisted contributions. That's what they reported, not a timed comparison. When you're submitting the patch, answer these before expecting a maintainer to get stuck in:

- What failed, and under what conditions?
- What did you change, and why does that fix it?
- How did you check, and what happened?

If you submit fifty recipes to a community cookbook, bake them first. Finding out which cake tastes like wallpaper paste is your job, not the editor's weekend.

**9. AI generates insecure code.**

So do humans. A [study of 2,315 C, C++ and C# snippets](https://link.springer.com/article/10.1007/s10664-026-10812-8) found vulnerabilities about as likely in either kind of code in its sample, whilst a [scanner study of more than 500,000 Python and Java samples](https://doi.org/10.1109/ISSRE66568.2025.00035) reported more high-risk findings in generated code. Different samples, different checks. Test the bloody code. Use AI to help find and fix defects where it earns its keep: [Google reported that Big Sleep found a memory safety issue in SQLite](https://projectzero.google/2024/10/from-naptime-to-big-sleep.html), which was fixed before it reached an official release.

Inspect the brakes whether a person or a robot fitted them. ‘Hand assembled’ is something you put in the brochure, not a result you put on the brake test.

**10. An AI-generated patch can contain code under an incompatible licence.**

This time the question is whether you're allowed to put that code in *this patch*, not whether the model was trained lawfully. Follow the project's rules and say where AI did enough of the work to change how someone ought to review it. If a suggestion looks copied, find the original and check the licence. [Copilot's public-code references](https://docs.github.com/en/copilot/concepts/copilot-surfaces/copilot-in-ides) can point you towards a match, but no match doesn't clear the code, either. If you can't establish your right to submit it, leave it out.

You can learn to make a sauce from a cookbook without putting the author's instructions and photos in yours. Changing the font doesn't make them yours.

**11. People submit AI-generated code they don't understand and disappear when it breaks.**

Then ask the person who sent the patch to explain it, show that it works and answer reasonable questions. Ten years on the mailing list isn't an explanation any more than ‘Claude did it’ is. Torvalds described the help he got and put his name on the Xe fix with `Signed-off-by`. Under the [Developer's Certificate of Origin](https://docs.kernel.org/process/submitting-patches.html#sign-your-work-the-developer-s-certificate-of-origin), that certifies the right to submit the work, or that you're passing on a contribution already certified in the prescribed way; it doesn't certify that someone else reviewed it.

If your new roof leaks, the builder doesn't get to refer you to the manufacturer of the nail gun.

### Skills and jobs

**12. Developers who rely on AI will lose the ability to write and understand software.**

If you never practise a skill, of course you'll get worse at it. Give people problems they have to reason about, design a solution for and test, sometimes without an assistant. I'd rather hear someone explain why rounding up broke the display than watch them type `round_down` from memory. Typing the right answer is the easy bit once you know why it's right.

A calculator can multiply the wrong numbers with impeccable accuracy. Being able to spot a daft answer is more useful than doing the same wrong sum by hand.

**13. AI gets in the way of collaboration and mentorship.**

Imagine you've found a settings dialogue you can't close with the keyboard. You can explain what's broken, but you've never worked with the toolkit and don't know where to look. An assistant can help you find the relevant code and join the discussion; it doesn't check the fix or respond to feedback for you. In the Linux Foundation survey, 71% of maintainers who answered the question saw a lower barrier to participation, and 46% of those answering about mentorship saw more need for it. Helping more people get started and expecting them to work with other people go together. Volunteers don't owe anybody a permanent help desk.

The public library has audiobooks because the point is to get people to the books. A reading test at the door would be a bloody odd way to go about it.

**14. AI will cost programmers their jobs.**

Some jobs may go and others will change. I write software for a living and would quite like to keep doing it. Fight for worker protections, and make sure they get a fair share of the gains. If a company gets the same work done in fewer hours, I'd like some of that time to go back to the people doing it, rather than the entire benefit going to shareholders.

You can buy a tin of paint and a roller from B&Q. A good decorator is still worth paying for, particularly when you see what your own cutting-in looks like in daylight. Making a job easier to attempt and making a profession redundant are two different things.

### Big Tech and craftsmanship

**15. Big Tech is using AI to tighten its grip.**

Of course it is. Leaving the work to the very companies you don't trust is a particularly useless way of resisting them. Build open models and tools, and make it possible to switch without binning everything you built around the old one.

Linux and [Firefox](https://www.mozilla.org/en-US/about/history/) gave us alternatives. Companies were involved, which is fine: the point was to have a choice, not to check that everyone making it possible was doing so unpaid.

**16. AI is overhyped and being shoved into everything.**

Completely agree. If I opened an app to press a button that already works, a new button offering to ‘help’ me press it is not an improvement. Leave people free to switch it off, and judge the tool by what it actually does rather than by the size of the font in the announcement.

The dot-com crash didn't switch off the internet. We managed to lose a great deal of bullshit without having to send the web back.

**17. AI reduces programming to churning out code.**

Only if you've confused programming with typing. The Xe correction made it into [stable Linux 6.18.51](https://cdn.kernel.org/pub/linux/kernel/v6.x/ChangeLog-6.18.51) because excluding the partly reserved page addressed the fault. The craft was working out what needed changing and leaving the rest of the driver alone. A bigger diff would have given everyone more code to check and maintain without making the desktop any less black. I'm not paid to type. I'm paid to solve problems.

I want clean water out of the taps and sewage somewhere other than the kitchen. I'm not giving the plumber a bonus for using more pipe.

**18. AI lets people without traditional programming expertise contribute.**

Good. Imagine two equally good patches: both tested, both properly licensed, both submitted by someone who can explain the change and stand behind it. One contributor used AI and the other wrote it unaided. What exactly am I supposed to mark down? Insufficient suffering? Nobody is entitled to a merge, and maintainers get to set their own rules. I still get to call a bad rule a bad rule.

At the community allotment, tomatoes don't taste better because you dug by hand. Reject the rotten tomatoes, not the cultivator.

## What Linus Torvalds actually said

In [his July reply on the Linux Media mailing list](https://web.archive.org/web/20261115074214/https://lore.kernel.org/linux-media/CAHk-=wi4zC%2BZe8e%2Bp3tMv8TtG_80KzsZ1syL9anBtmEh5Z40vg@mail.gmail.com/), Torvalds was discussing AI assistance with patch review. ‘Linux is not one of those anti-AI projects’, he wrote, but also, ‘We're not forcing anybody to use it’. You can leave people to work unaided without insisting that everybody else do the same.

In [his 13th October reply on the Linux Kernel mailing list](https://lkml.iu.edu/2610.1/13255.html), he suggested banning compilers for submissions and editors for commit messages, which would at least make for a very quiet mailing list. In case the sarcasm wasn't obvious, he followed it with:

> Do you not see how UTTERLY STUPID those kinds of rules would be?

What he actually wanted from contributors was simpler: ‘I expect people to understand what they are doing.’ In v7.4-rc1, the dedicated `Assisted-by` requirement went away; [separate guidance on disclosing meaningful generated material](https://github.com/torvalds/linux/blob/v7.4-rc1/Documentation/process/generated-content.rst) and [human sign-off](https://github.com/torvalds/linux/blob/v7.4-rc1/Documentation/process/coding-assistants.rst) stayed.

I'd take the patch that went into stable. There's a person who put his name to it, an explanation of what broke and a small fix that makes sense once you've read that explanation. I'd send the imaginary rewrite back even if every line was lovingly typed by hand. Reject insecure or unmaintainable code, and code the contributor has no right to submit. Make them do the bloody work of checking it and explaining it. If they've done that and the patch is good, I don't give a toss who typed which line.

Are we interested in building better software, or making sure everybody builds it the hard way?
