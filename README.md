# Scrabble Scorekeeper

A simple, mobile-friendly page for keeping Scrabble scores and checking words. Plain HTML, CSS and JavaScript with no build step, so it runs on GitHub Pages as is.

## Features

- 2 or more players. Enter each turn's points (and optionally the word); it moves to the next player automatically.
- Pass / swap, undo last turn, and tap a player to change whose turn it is.
- End game: type each player's leftover tiles and the app subtracts them (and gives the total to whoever went out).
- Word lookup: is it allowed, plus a definition.
- Word lists: Collins CSW21 (UK/Australia/international), NWL2023 (USA/Canada) or ENABLE. (CSW24 isn't publicly available as a file; it ships only inside the licensed Collins Zyzzyva app.)
- Scores are saved in the browser, so a refresh doesn't lose them.

## Publish on GitHub Pages

1. Put `index.html`, `style.css`, `app.js` and this README on the `main` branch.
2. On GitHub open **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, branch `main`, folder `/ (root)`, and save.
4. After a minute the site is live at `https://<your-username>.github.io/scrabble-board/`.

## Word lists

Downloaded from GitHub the first time they are used, then cached by the browser:

- CSW21 and NWL2023 from [scrabblewords/scrabblewords](https://github.com/scrabblewords/scrabblewords). Collins Scrabble Words © HarperCollins.
- ENABLE from [dolph/dictionary](https://github.com/dolph/dictionary).
