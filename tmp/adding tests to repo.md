# adding tests to repo

Our goal is to add tests for this repo. The goal is to make some basic tests asserting functionality works.

## Task 1: research official documentation for VSCode extension tests

Read & understand this:

https://code.visualstudio.com/api/working-with-extensions/testing-extension

You may need to serardh

## Task 2: research our existing tests

Read the tests that already exist in here, how they are launched, and what they do.

Today they are basic and do not seem to interact much with the extension, just testing tools around the extension.

## Task 3: research how the SVN version control extension does tests

Research this repo, an extension another version control system, SVN. It has tests, how do those tests work, how do they interact with the VSCode extension itself, or with VSCode externally?

This respository is located here:

/Users/brianmalehorn/jjk/tmp/svn-scm

## Task 4: plan what changes to make for a basic test

My goal is to have a basic test that starts up VSCode and confirms this extension is loaded. That it shows that there is a Source Control entry on the sidebar (or otherwise is advertising itself as avaiable), and that has some entries. And

Additionally, it should:

1. run with configurable settings (empty settings.json or otherwise controlled by us)
2. run with all other extensions disabled
3. set up the workspace folder with `jj git init` ahead of time

Do not write those code changes yet. Just write out the plan of what you plan on doing and wait for my approval.

---

# more tests

## Task 1: research current behavior

Today, we have a source control manager entries that show "Working Copy" and "Parent Commit". Research what these functions do today by looking at our source code.


It will poll for 


## Task 2: plan tests 

You are going to add one or more tests about the file statuses.
It is going to do something like this:
1. shell command: `jj git init` (this already happens today I think)
2. in that directory: add a new file `file1.txt`
3. in that directory: `jj describe -m 'add file1.txt`
4. in that directory: `jj new`
5. in that directory: add a new file `file2.txt`
6. in that directory: `jj describe -m 'add file2.txt`
7. finally, it asserts that the source control manager has the following state:
An entry matching `Working Copy.*add file2.txt`.
In that entry dropdown, it shows that `file2.txt` has been added.
An entry matching `Parent Commit.*add file1.txt`.
In that entry dropdown, it shows that `file1.txt` has been added.
This should take no more than 10 seconds to show up with this change.

Write out what you plan to do to add this test or similar tests. Do not write them yet, just tell me the plan and wait for my approval.



----
