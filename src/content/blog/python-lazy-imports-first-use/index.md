---
title: 'Python 3.15: choosing which imports to defer'
description: Python 3.15's lazy imports let you delay loading dependencies. The useful question is what to defer, when to fail and how to measure the result.
pubDate: 2026-10-24
category: programming
tags:
  - Python
  - PEP 810
  - Performance
cover: ./cover.webp
coverAlt: A small green lamp glows beside a printing press tucked under a blanket, with a stack of blank paper waiting nearby.
share:
  linkedin: |-
    A quicker startup isn't necessarily a quicker finished job.

    Python 3.15's explicit lazy imports let a command skip dependencies it never uses. For commands that do need them, the loading work and possible errors move to first use instead.

    This walkthrough follows an imaginary status/report tool through a useful optimisation, a refactor that undoes it, and the decision about when dependencies should be checked. It finishes with a practical plan for measuring the whole operation, not just startup.

    #Python #SoftwareEngineering #Performance
  x: Python 3.15's lazy imports can avoid unnecessary work or simply postpone it. Follow a small command-line example through first use, delayed errors and what to measure before keeping the change.
  bluesky: A lazy import doesn't make loading disappear. Python 3.15 gives you control over when it happens, but even an innocent dispatch dictionary can bring it straight back into startup.
  threads: 'You make an import lazy, then put the imported function in a dispatch dictionary. Congratulations: you''ve deferred loading until first use, then arranged for first use to happen immediately. A practical look at Python 3.15''s lazy imports and where they actually help.'
  mastodon: |-
    Python 3.15 adds explicit lazy imports. This walkthrough uses an imaginary status/report tool to explain when loading is avoided, when it's merely postponed, and why a dispatch dictionary can trigger it early. Includes a practical evaluation plan for timing, missing dependencies and registration.

    #Python #SoftwareEngineering #PerformanceTesting
  facebook: Python 3.15 lets you delay loading dependencies until they're needed. That sounds simple, until a small refactor brings the work straight back into startup. Here's how to choose what to defer and check whether it helps.
---

Imagine a command-line tool with two commands: one checks its status, the other generates a report. You ask for the status, but before answering, it loads the entire reporting subsystem. You wanted a quick answer. Apparently, that requires convening the reporting department.

[Python 3.15.0, released on 9 October 2026](https://www.python.org/downloads/release/python-3150/), adds explicit lazy imports: a way to put off loading a module until you use it. For a tool like this, that means the status command can leave the reporting dependency alone. Ordinary imports still behave as before under normal interpreter settings; upgrading doesn't automatically make them lazy.

The interesting decision is what to defer, and until when. I'd use this feature to keep irrelevant work out of a command's path, rather than sprinkle `lazy` over every import and celebrate a shorter startup. Our imaginary tool makes the distinction quite clear.

## Let the status command get on with it

Loading a Python module involves executing its top-level code. That can mean loading other modules and doing initialisation before your command gets anywhere near the work you asked it to do. An import isn't just an entry in a list of things the program might need later.

Here's the relevant part of our tool, with `report_backend` standing in for a made-up dependency:

```python
lazy import report_backend

def run(command):
    if command == 'status':
        return 'status available'
    if command == 'report':
        return report_backend.render()
    raise ValueError(command)
```

The [lazy declaration](https://docs.python.org/3.15/reference/simple_stmts.html#lazy-imports) is at module scope, but it doesn't load the backend there. Loading waits until something accesses the imported name.

For this example, the two paths look like this:

```text
run(command)
    |
    +--> status --> return 'status available'
    |               (report_backend stays unloaded)
    |
    +--> report --> load report_backend --> call render()
                    (first access)
```

Take the status branch. Nothing touches `report_backend`, so, provided nothing elsewhere loads it, the tool can answer and exit without loading it at all. That's work we've removed from this particular run, not merely shuffled somewhere less visible.

Now take the report branch. Python reaches `report_backend.render()`, accesses the name and loads the module before it can call the function. Reporting still needs its backend. The new keyword hasn't negotiated an exemption.

This is the distinction worth keeping in mind: **unused work can disappear; necessary work gets postponed.** Measuring only startup won't tell you whether the first report finishes any sooner.

## Then we tidy up the command handling

Suppose you replace the branching with a dispatch dictionary. Quite reasonable: command names on one side, functions on the other.

At the top level, you add this:

```python
HANDLERS = {'report': report_backend.render}
```

There's our loading work again.

Python has to evaluate `report_backend.render` to put the function into the dictionary. That accesses the imported name, which triggers loading while the dictionary is being constructed, before the tool has selected a command.

You've deferred loading until first use, then helpfully arranged for first use to happen immediately.

Keeping the access inside the reporting function, as in the original example, leaves it on the reporting path. So when you consider making an import lazy, follow the name through the surrounding code too. Setup code that collects functions or constructs objects can bring loading straight back into startup.

There's a related distinction in my [Smart DnD plugin manager](https://github.com/keithvassallomt/smart-dnd-linux/blob/v0.1.1/smart_dnd/plugins/manager.py): it calls `ep.load()` during discovery, then checks and stores valid plugin classes. Finding entry points and loading them are separate steps, even though that implementation does both together. A lazy import elsewhere doesn't remove the explicit loading step.

## Now the backend is missing

Let's give our imaginary tool another problem: the reporting dependency isn't installed.

With the lazy declaration, the error arrives when code first accesses `report_backend`, rather than when Python reaches the import statement. Errors inside the module being loaded, including syntax errors, are delayed too.

For this tool, that can be useful. Why should a missing reporting dependency prevent you from checking status? I'd handle the failure when reporting is selected and explain what's missing, leaving unrelated commands available.

But change the setting slightly. Suppose this is a service whose job is to generate reports, and it announces that it's ready to accept reporting requests. I'd want the reporting capability checked before that announcement, not when the first user asks it to do its job.

Being able to print ‘ready’ is a fairly modest qualification for a reporting service.

Neither arrangement makes lazy imports inherently good or bad. You're choosing where failure belongs: when an optional feature is requested, or before a required capability is advertised. That choice needs to match what you're promising the user.

There's another bit of import behaviour to account for here. Some modules register handlers as a side effect of being imported. If you defer loading, you defer registration as well; a lazy declaration that nobody accesses won't arrange those handlers for you.

[PEP 810 recommends explicit initialisation functions](https://peps.python.org/pep-0810/#how-do-lazy-imports-affect-modules-with-import-time-side-effects) for this sort of work. Call the registration deliberately when it's needed, and check that it has happened before using the feature. That makes the dependency visible instead of leaving an otherwise unused import responsible for quietly setting everything up.

If your application supports older Python versions, an ordinary import inside a function is still an option. There's also [the `__lazy_modules__` compatibility mechanism](https://peps.python.org/pep-0810/#what-about-forwards-compatibility-with-older-python-versions): list fully qualified module names before ordinary imports, and Python 3.15 defers matching module-level imports while older versions import eagerly. The new `lazy import` spelling itself won't compile on older interpreters.

## Give it one dependency, then measure

I'd start with just the reporting backend, not a wholesale conversion. We have a clear reason to defer it: the status command doesn't need it. Now we need to check whether the change does what we intended, without making the reporting path unpleasant.

Keep the interpreter, installed dependencies, hardware and workload the same between comparisons, then check these cases:

1. **Status or help:** use a fresh process and measure a command that doesn't need the dependency.
2. **The first report:** use another fresh process and measure through to the completed report, not just a prompt or readiness message.
3. **A later report:** if the application handles repeated operations, measure another report in the same process separately.
4. **Failure and registration:** remove the optional dependency in a test environment and check the error you get. Confirm that required handlers exist before their feature is declared ready.

[Python's `-X importtime` option](https://docs.python.org/3.15/using/cmdline.html#cmdoption-X) helps locate import costs, reporting self time and cumulative time including nested imports. Use it to diagnose where loading time goes, rather than treating it as the timing of the whole job; its output also has a documented limitation with multithreaded applications.

Fresh processes matter because Python checks its [module cache](https://docs.python.org/3.15/reference/import.html#the-module-cache). A report generated after the backend has loaded isn't measuring the same thing as the first one. Keep those results separate.

## Where lazy imports earn their keep

I think this is a useful addition to Python, particularly for tools with several commands that need different dependencies. It lets a simple command stay simple without loading everything the application knows how to do. If a run needs those dependencies anyway, you're mainly choosing when it pays the loading cost.

That's still a useful choice, but a faster arrival at ‘ready’ followed by the same wait isn't a faster completed job. It's the software equivalent of being shown to your table before anyone checks whether the kitchen is open.

For our tool, I'd retain deferral if it lets status avoid irrelevant work and leaves the delay and possible failure at an acceptable point when reporting is selected. If reporting must already be available when the application announces readiness, check it during initialisation instead. That gives you a concrete decision based on both the initial response and the completed operation, rather than one flattering startup number.
