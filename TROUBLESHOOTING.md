# Troubleshooting

* [The server doesn't start](#issue1)
* [Changes made to the widgets.json file don't propagate to clients](#issue2)

### <a name="issue1">The server doesn't start</a>
> Make sure the port used by the server isn't in use by another application. Also make sure the port isn't reserved by Hyper-V. Use the command below on an elevated command prompt/Powershell to see the reserved port ranges.
```
netsh interface ipv4 show excludedportrange protocol=tcp
```

> If the port isn't in use, restart the computer and try again.

### <a name="issue2">Changes made to the widgets.json file don't propagate to clients</a>
> Check whether the widgets.json file is valid - e.g. copy the file contents and paste into https://jsonlint.com
