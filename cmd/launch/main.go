package main

import (
	"flag"
	"fmt"
	"os"

	"github.com/saaketht/launch/internal/tui"
)

func main() {
	workDir := flag.String("workdir", "./.launch", "directory for generated files")
	flag.Parse()

	dp, err := tui.Run(*workDir)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}

	_ = dp // deployment plan available for future use
}
