# Brownfield Code Surgeon - A Claude Code Plugin

Claude Code plugin that delivers the seven-phase brownfield surgery workflow as slash commands, subagents, and phase-aware hooks.

This workflow is already published as a paper Zenodo titled [Agentic Code Surgery for Brownfield Systems](https://zenodo.org/records/19640171) by the author of this plugin.


## How to install?

Once you are in claude code, paste the following command and press enter.

```bash
/plugin marketplace add vivganes/brownfield-code-surgery
```

Once this command succeeds, paste the following command and  press enter.

```bash
/plugin install brownfield-code-surgeon
```

Once the installation completes, run the following command to make sure your plugin is loaded.

```bash
 /reload-plugins 
```

## How to run?

Kickstart the plugin using the following command.

```
 /brownfield-code-surgeon:surgery  <<describe the new functionality you want to build>>
```







