Untitled - LD48 - Deeper and deeper
============================

Ludum Dare 45 Entry by Jimbly

Components:
* Draft visuals, esp edges, viewable holes
* Generate two levels, let you move around on one and destruct it
  * Not full level view, but zoomed in with a minimap?
* Show level underneath, add parallax
* When destructing into an ore vein, score it

Roguelike miner - Dwarven Scout/Surveyor?
* Goal: extract as much ore from a level as possible while scouting the next level and choosing a place to dig
* Primary resource: shovels - can be used to dig a hole to level below (5 tile in plus pattern?) or did a tunnel (5 tile straight?)
  * Must dig down if no holes are accessible with last shovel
* When out of shovels, choose a hole and drop down
* Levels are:
  * solid rock - can dig through, cannot see into
  * open space
  * open space with visible hole beneath (wooden planks across a hole / grates)
  * open space with impassable hole beneath (only naturally occurring, cannot create)
  * ore veins - when reached on the current level, they're immediately cleared and scored
  * lava
* Possible interesting landscape features
  * rivers - one way travel, go through entire level, so if you find part of it you can see the flow and you can guess where it's going
  * impassable chasms that divide the map - one per level after level X - want to choose which side of the chasm to drop down into
* Visuals
  * Need to be able to see through the holes
    * If analog movement, could show a 45 degree sneak peak through the holes, cutting away the top layer view; needs highish res
  * For chasms, etc, need to be able to distinguish the difference between lava on my layer and lava on the layer below - 50% black enough? parallax will help
  * If ASCII art - probably would just have a toggle view button to look below and see everything that is on the next layer while it's held
    * Might want this anyway


Initial Brainstorm
* Roguelike w/ spatial relation between floors - can dig your own stairs/openings, can see into lower floor if there's a big pit
  * Traditional - fighting monsters, dying from health hunger?
  * Mining-oriented?
    * Go in, get ore, sell, upgrade, repeat?
    * Build mining cart track and NPCs mine?
  * Shovels is probably a primary resource
* Side-view vertical-scrolling platformer a la Vertical Drop Heroes?
  * Could do fun async multiplayer showing how far everyone else near you has made it
* Oil prospecting a la Turmoil?
  * Infinite depth but upgrade level of equipment limits how deep you can go
    * have to balance how much to extract from a site before cashing in and upgrading
    * need some overhead costs so you can't just grind the first bit over and over, each time have bigger overhead
      * series of independent levels and you just try to high score them but each level lets you go deeper?
  * digging is a real-time thing where you're steering a digger with ~90 degrees of angle control, and either stop (dropping a pipe) when you hit oil, or trigger a radar pulse; maybe can see some nearby obstacles, and digging gets canceled (higher cost?) if you hit stone - balance playing it safe vs hoping to get lucky and get deep
* Side-scrolling sim game building a mining village?

