import React from 'react'

const EnvironmentalInsights = async () => {
    let test_result;
    try {
      const res = await fetch("http://localhost:8001/metrics?category=environmental");

      if (!res.ok) {
        const errorText = await res.text()
        console.error("Server error from fetching aggrated data:", errorText);
      } else {
        //const result = await res.json();
        test_result = await res.json();
        console.log("Server response (most likely successful):", test_result);
      }
    } catch (err) {
      console.error("Failed to contact backend (fetch error):", err);
    }


  return (
      <div>
          <h1>Environmental Insights</h1>
            <p>Here you can find insights related to environmental data.</p>
            {/* You can render the fetched data here */}
          {/* Example: <pre>{JSON.stringify(data, null, 2)}</pre> */}
          <p>To check which one works or not</p>
          <code>{test_result}</code>
      </div>
  )
}

export default EnvironmentalInsights




// {
//   category: 'environmental',
//   file_count: 3,
//   record_count: 7272,
//   aggregated_analysis: {
//     numeric_summary: { year: [Object], month: [Object], emissions_tons: [Object] },
//     energy: {
//       matched_columns: [Array],
//       total: {},
//       average: {},
//       total_energy_kwh: 0
//     },
//     emissions: {
//       matched_columns: [Array],
//       total: [Object],
//       average: [Object],
//       total_emissions_kg: 11817416.49
//     },
//     derived: { emissions_per_kwh: null }
//   }
// }