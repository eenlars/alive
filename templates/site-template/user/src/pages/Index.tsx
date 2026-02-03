const Index = () => {
  const currentDomain = window.location.hostname
  const terminalUrl = `https://terminal.goalive.nl?domain=${currentDomain}`

  return (
    <div className="min-h-screen bg-white">
      <div className="px-8 py-24 max-w-4xl mx-auto">
        <div className="space-y-16">
          <div className="space-y-8">
            <h1 className="text-7xl font-normal tracking-tight text-gray-900 leading-none">Hello.</h1>

            <div className="w-32 h-1 bg-gray-900" />

            <p className="text-2xl font-normal text-gray-700 leading-relaxed max-w-2xl">
              This space belongs to you now.
              <br />
              Shape it however you like.
            </p>
          </div>

          <div className="space-y-6">
            <p className="text-lg text-gray-600 font-normal">When you're ready:</p>

            <a
              href={terminalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-lg text-gray-900 border-b border-gray-900 hover:border-gray-500 hover:text-gray-500 transition-colors pb-1 font-normal"
            >
              Start creating
            </a>
          </div>

          <div className="pt-24">
            <p className="text-sm text-gray-400 font-normal tracking-wider">{currentDomain}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Index
